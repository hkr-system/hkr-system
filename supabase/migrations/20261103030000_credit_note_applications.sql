-- Credit notes applied to invoices (Gabriel, Nov 3 2026): the order's "RMA discount" is no longer typed. A credit note
-- (approved by the admin, with or without an RMA / IMEIs) is created first and then applied to one or more orders; one
-- credit note can be split across several invoices. The invoice prints one line per credit note: "Credit note <number>".
-- An approved / sent invoice is frozen: an admin reopens it (new version) to add a credit note to an earlier invoice.

create table public.credit_note_applications (
  id              uuid primary key default gen_random_uuid(),
  credit_note_id  uuid not null references public.credit_notes (id) on delete restrict,
  order_id        uuid not null references public.orders (id) on delete cascade,
  account_id      uuid not null references public.accounts (id) on delete cascade,   -- copied for RLS
  amount_usd      numeric(12, 2) not null check (amount_usd > 0),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  unique (credit_note_id, order_id)
);
create index credit_note_applications_order_idx on public.credit_note_applications (order_id);
create index credit_note_applications_cn_idx on public.credit_note_applications (credit_note_id);
select public.setup_table('public.credit_note_applications');

-- checks: same client, approved credit note in USD, enough left on it, invoice not frozen
create function public.credit_note_applications_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cn record; o record; v_used numeric; v_order uuid := coalesce(new.order_id, old.order_id);
begin
  if exists (select 1 from public.invoices i where i.order_id = v_order and i.status in ('approved', 'sent')) then
    raise exception 'The invoice of this order is approved: an admin reopens it first, then the credit note can be changed.'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  select * into cn from public.credit_notes where id = new.credit_note_id;
  select id, account_id into o from public.orders where id = new.order_id;
  if cn.account_id <> o.account_id then
    raise exception 'The credit note belongs to another client.' using errcode = '23514';
  end if;
  if cn.status not in ('approved', 'issued', 'applied') then
    raise exception 'Only a credit note approved by the admin can be applied (now: %).', cn.status using errcode = '23514';
  end if;
  if cn.currency <> 'USD' then
    raise exception 'Only USD credit notes go on our invoice.' using errcode = '23514';
  end if;
  select coalesce(sum(amount_usd), 0) into v_used from public.credit_note_applications
   where credit_note_id = new.credit_note_id and id <> new.id;
  if new.amount_usd > cn.amount - v_used then
    raise exception 'Only US$ % is left on credit note %.', to_char(cn.amount - v_used, 'FM999,999,990.00'), cn.number
      using errcode = '23514';
  end if;
  new.account_id := o.account_id;
  return new;
end;
$$;
create trigger credit_note_applications_check
  before insert or update or delete on public.credit_note_applications
  for each row execute function public.credit_note_applications_check();
revoke execute on function public.credit_note_applications_check() from public, anon, authenticated;

-- after a change: the order's discount = Σ its credit notes (order_recalc then recomputes the totals), and the credit
-- note is "Applied" when fully used (back to Issued when an application is removed)
create function public.credit_note_applications_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
  v_cn uuid := coalesce(new.credit_note_id, old.credit_note_id);
  cn record; v_used numeric; v_where text;
begin
  perform set_config('hkr.cn_sync', 'on', true);
  update public.orders o
     set rma_discount_usd = coalesce((select sum(a.amount_usd) from public.credit_note_applications a where a.order_id = v_order), 0)
   where o.id = v_order;
  select * into cn from public.credit_notes where id = v_cn;
  select coalesce(sum(a.amount_usd), 0),
         string_agg(coalesce(nullif(x.hk_invoice_no, ''), x.number), ', ' order by x.number)
    into v_used, v_where
    from public.credit_note_applications a join public.orders x on x.id = a.order_id
   where a.credit_note_id = v_cn;
  if v_used >= cn.amount and cn.status in ('approved', 'issued') then
    update public.credit_notes set status = 'applied', applied_to = 'next_invoice', applied_invoice_no = v_where,
           applied_order_id = v_order where id = v_cn;
  elsif v_used < cn.amount and cn.status = 'applied' then
    update public.credit_notes set status = 'issued', applied_on = null where id = v_cn;
  elsif cn.status = 'applied' then
    update public.credit_notes set applied_invoice_no = v_where where id = v_cn;
  end if;
  perform set_config('hkr.cn_sync', 'off', true);
  return null;
end;
$$;
create trigger credit_note_applications_sync
  after insert or update or delete on public.credit_note_applications
  for each row execute function public.credit_note_applications_sync();
revoke execute on function public.credit_note_applications_sync() from public, anon, authenticated;

-- the order's discount comes only from its credit notes (a typed change is ignored)
create function public.orders_rma_discount_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('hkr.cn_sync', true), '') = 'on' or (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.rma_discount_usd := 0;
  elsif new.rma_discount_usd is distinct from old.rma_discount_usd then
    new.rma_discount_usd := old.rma_discount_usd;
  end if;
  return new;
end;
$$;
create trigger orders_rma_discount_guard
  before insert or update of rma_discount_usd on public.orders
  for each row execute function public.orders_rma_discount_guard();
revoke execute on function public.orders_rma_discount_guard() from public, anon, authenticated;

-- the credit-note guard accepts the status changes made by the sync above (Applied ↔ Issued)
create or replace function public.credit_notes_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text; v_next int; v_admin boolean := public.is_admin();
  v_system boolean := (select auth.uid()) is null or coalesce(current_setting('hkr.cn_sync', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.number is null or new.number = '' then
      perform pg_advisory_xact_lock(hashtext('credit_notes:' || new.account_id::text));
      select code into v_code from public.accounts where id = new.account_id;
      select coalesce(max(substring(number from '-CN-([0-9]+)$')::int), 0) + 1 into v_next
        from public.credit_notes where account_id = new.account_id;
      new.number := v_code || '-CN-' || lpad(v_next::text, 2, '0');
    end if;
    if not v_system then
      new.status := 'draft';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'approved' and not v_admin and not v_system then
      raise exception 'Only an admin (Sales Director) approves a credit note (SOP P10).' using errcode = '42501';
    end if;
    if new.status = 'issued' and old.status not in ('approved', 'applied') and not v_system then
      raise exception 'A credit note is issued only after it is approved.' using errcode = '23514';
    end if;
    if new.status = 'applied' and old.status not in ('issued', 'approved') and not v_system then
      raise exception 'Only an issued credit note can be applied.' using errcode = '23514';
    end if;
    if new.status = 'applied' and coalesce(new.applied_invoice_no, '') = '' and new.applied_to <> 'refund' then
      raise exception 'Write the invoice number where the credit was applied.' using errcode = '23514';
    end if;
    if new.status < old.status and new.status <> 'cancelled' and not v_admin and not v_system then
      raise exception 'Only an admin moves a credit note back.' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and not v_admin and not v_system then
      raise exception 'Only an admin cancels a credit note.' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and exists (select 1 from public.credit_note_applications a where a.credit_note_id = new.id) then
      raise exception 'Remove the credit note from its orders before cancelling it.' using errcode = '23514';
    end if;
    if new.status = 'approved' then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
      new.approved_at := now();
      new.issued_on := coalesce(new.issued_on, current_date);   -- SOP: date of issue = the day the SD approves
    end if;
    if new.status = 'applied' then
      new.applied_on := coalesce(new.applied_on, current_date);
    end if;
  elsif old.status <> 'draft' and not v_admin and not v_system
        and (new.amount, new.currency, new.rma_id, new.order_id, new.invoice_no, new.in_favor_of)
            is distinct from (old.amount, old.currency, old.rma_id, old.order_id, old.invoice_no, old.in_favor_of) then
    raise exception 'The credit note is approved: only an admin changes it.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.amount < coalesce((select sum(a.amount_usd) from public.credit_note_applications a where a.credit_note_id = new.id), 0) then
    raise exception 'The credit note is already applied for more than this amount.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- access: read = account access; apply / remove = admin and specialist (they prepare invoices)
revoke all on public.credit_note_applications from anon;
grant select, insert, update, delete on public.credit_note_applications to authenticated;
create policy credit_note_applications_read on public.credit_note_applications
  for select to authenticated using (public.has_account_access(account_id));
create policy credit_note_applications_insert on public.credit_note_applications
  for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id));
create policy credit_note_applications_update on public.credit_note_applications
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id))
  with check ((select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id));
create policy credit_note_applications_delete on public.credit_note_applications
  for delete to authenticated
  using ((select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id));
