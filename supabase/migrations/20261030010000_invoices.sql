-- Phase 3 remainder — Invoices (Gabriel, Oct 30 2026). Brief Phase 3 item 6:
--   PDF + xlsx from the order lines and the account's invoice_format; header per billing entity;
--   status Draft → Approved (admin) → Sent; every version stored in the account files;
--   orders.hk_invoice_no linked to the approved invoice; numbering MMDDYYYY (+ -2, -3… when the date repeats).
-- Layout and wording copied from the 5 reference invoices (Commercial Invoice, Ever State).
-- Company, bank and USDT details live in settings (filled in the app), never in this public repo.

-- -----------------------------------------------------------------------------
-- 1. Invoiced-entity data on the account (SOP P1: legal name and address, VAT/EORI, other ids)
-- -----------------------------------------------------------------------------
alter table public.accounts
  add column billing_address text,   -- address lines of the invoiced entity, one per line (incl. country)
  add column company_ids     text;   -- other ids printed under it, one per line (EIN, NIT, KVK, RSIN…)

-- -----------------------------------------------------------------------------
-- 2. Invoices
-- -----------------------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'approved', 'sent', 'void');

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts (id) on delete restrict,
  order_id        uuid not null references public.orders (id) on delete restrict,
  number          text not null default '',          -- MMDDYYYY or MMDDYYYY-n, set by trigger
  invoice_date    date not null default current_date,
  status          public.invoice_status not null default 'draft',
  version         integer not null default 1,
  billing_entity  public.billing_entity not null default 'ever_state',
  payment_method  public.payment_method not null default 'wire',
  consignee       text not null default '',          -- "Ultimate Consignee Name and Address" block
  ship_to         text not null default '',          -- "Ship To Name and Address" block
  notify          jsonb not null default '{}',       -- {contact, address, phone}
  shipment        jsonb not null default '{}',       -- {country, reference, awb, packages, net_kg, gross_kg}
  lines           jsonb not null default '[]',       -- [{kind, description, qty, unit_price, total}]
  total_usd       numeric(12, 2) not null default 0,
  approved_at     timestamptz,
  approved_by     uuid,
  sent_at         timestamptz,
  sent_by         uuid,
  file_pdf_id     uuid references public.files (id) on delete set null,
  file_xlsx_id    uuid references public.files (id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now()
);
create unique index invoices_number_key on public.invoices (number) where number <> '';
create unique index invoices_one_live_per_order on public.invoices (order_id) where status <> 'void';
create index invoices_account_idx on public.invoices (account_id);
select public.setup_table('public.invoices');

-- Number: MMDDYYYY of the invoice date; a second invoice on the same date gets -2, then -3…
create function public.invoice_next_number(p_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := to_char(p_date, 'MMDDYYYY');
  v_n int;
begin
  select count(*) into v_n from public.invoices where number = v_base or number like v_base || '-%';
  return case when v_n = 0 then v_base else v_base || '-' || (v_n + 1) end;
end;
$$;
revoke execute on function public.invoice_next_number(date) from public, anon, authenticated;

-- Rules: account copied from the order; drafts are edited, approved/sent invoices are frozen;
-- only admin approves, reopens (new version) or voids; anyone who prepares invoices marks it sent.
create function public.invoices_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := auth.uid() is null or public.is_admin();
begin
  select o.account_id into new.account_id from public.orders o where o.id = new.order_id;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'A new invoice starts as Draft.' using errcode = '42501'; end if;
    if new.number = '' then new.number := public.invoice_next_number(new.invoice_date); end if;
    return new;
  end if;

  if new.number is distinct from old.number and not v_admin then
    raise exception 'Only an admin can change an invoice number.' using errcode = '42501';
  end if;
  if new.order_id is distinct from old.order_id then
    raise exception 'An invoice stays on its order.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' and old.status = 'draft' then
      if not v_admin then raise exception 'Only an admin can approve an invoice.' using errcode = '42501'; end if;
      new.approved_at := now(); new.approved_by := auth.uid();
    elsif new.status = 'sent' and old.status = 'approved' then
      new.sent_at := now(); new.sent_by := auth.uid();
    elsif new.status = 'draft' and old.status in ('approved', 'sent') then
      if not v_admin then raise exception 'Only an admin can reopen an invoice.' using errcode = '42501'; end if;
      new.version := old.version + 1;
      new.approved_at := null; new.approved_by := null; new.sent_at := null; new.sent_by := null;
    elsif new.status = 'void' then
      if not v_admin then raise exception 'Only an admin can void an invoice.' using errcode = '42501'; end if;
    else
      raise exception 'Invoice status cannot go from % to %.', old.status, new.status using errcode = '42501';
    end if;
  elsif old.status <> 'draft' then
    -- frozen content: only the stored files may be attached after approval
    if (new.invoice_date, new.billing_entity, new.payment_method, new.consignee, new.ship_to, new.notify, new.shipment, new.lines, new.total_usd)
       is distinct from (old.invoice_date, old.billing_entity, old.payment_method, old.consignee, old.ship_to, old.notify, old.shipment, old.lines, old.total_usd) then
      raise exception 'An approved invoice cannot be edited: an admin reopens it as a new version.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger invoices_before_write
  before insert or update on public.invoices
  for each row execute function public.invoices_before_write();
revoke execute on function public.invoices_before_write() from public, anon, authenticated;

-- The order shows the number of its approved invoice (brief: orders.hk_invoice_no links to it).
create function public.invoices_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('approved', 'sent') and (tg_op = 'INSERT' or old.status is distinct from new.status or old.number is distinct from new.number) then
    update public.orders set hk_invoice_no = new.number where id = new.order_id and hk_invoice_no is distinct from new.number;
    insert into public.order_events (order_id, account_id, kind, user_id, body)
    values (new.order_id, new.account_id, 'note', auth.uid(),
            'Invoice ' || new.number || case when new.version > 1 then ' (version ' || new.version || ')' else '' end ||
            case new.status when 'approved' then ' approved' else ' sent to the client' end);
  end if;
  return null;
end;
$$;
create trigger invoices_after_write
  after insert or update on public.invoices
  for each row execute function public.invoices_after_write();
revoke execute on function public.invoices_after_write() from public, anon, authenticated;

-- Access: everyone with the account reads; the specialist and admin prepare (brief: AS prepares,
-- admin approves); admin deletes drafts only.
create policy invoices_read on public.invoices
  for select to authenticated using (public.has_account_access(account_id));
create policy invoices_insert on public.invoices
  for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id));
create policy invoices_update on public.invoices
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id))
  with check ((select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id));
create policy invoices_delete on public.invoices
  for delete to authenticated using ((select public.is_admin()) and status = 'draft');

alter table public.files drop constraint files_owner_table_check;
alter table public.files add constraint files_owner_table_check
  check (owner_table in ('accounts', 'orders', 'rmas', 'price_lists', 'credit_notes', 'invoices'));

-- -----------------------------------------------------------------------------
-- 3. Settings: issuer per billing entity (empty: Gabriel fills it in the app) + fixed texts
-- -----------------------------------------------------------------------------
insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('invoice_issuers', 'invoices', 'Invoice issuer per billing entity',
   '{"ever_state": {}, "streamline_fze": {}}', false, 600,
   'Exporter block, signer, phones, bank details and USDT wallet printed on invoices, per billing entity. Edited in Settings → Invoices.'),
  ('invoice_texts', 'invoices', 'Fixed invoice texts',
   '{"freight": "FOB HK", "payment_terms": "Pre-payment", "via": "FEDEX/DHL Express", "from": "Hong Kong", "made_in": "China", "packages": "1", "net_kg": "N/A", "gross_kg": "N/A", "export_reference": "Export Invoice of Electronics Products", "notes": ["Please Note: These commodities, technology, used phones, or software were exported from Hong Kong in accordance with the Export Administration Regulations.", "Diversion contrary to Hong Kong law prohibited."], "footer": "This invoice is for export/import and payments purposes."}',
   false, 610,
   'Texts that repeat on every invoice (taken from the reference invoices). JSON: keep the same keys.')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Fix: deleting an order (cascade to its lines) must not try to recalculate its finance row.
-- -----------------------------------------------------------------------------
create or replace function public.order_finance_recalc(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost numeric; v_total numeric;
begin
  if p_order is null or not exists (select 1 from public.orders where id = p_order) then
    return;
  end if;
  select sum(l.qty * f.base_price_usd) into v_cost
    from public.order_lines l join public.order_lines_finance f on f.order_line_id = l.id
   where l.order_id = p_order;
  select total_usd into v_total from public.orders where id = p_order;
  insert into public.orders_finance (order_id, base_cost_usd, margin_pct)
  values (p_order, v_cost,
          case when v_cost is not null and v_total > 0 then round((v_total - v_cost) / v_total * 100, 3) end)
  on conflict (order_id) do update
    set base_cost_usd = excluded.base_cost_usd, margin_pct = excluded.margin_pct;
end;
$$;
revoke execute on function public.order_finance_recalc(uuid) from public, anon, authenticated;
