-- Invoice numbers and intermediary payments (Gabriel, Nov 2 2026).
--  1. Our invoice number is <client code>-INV-NN, a sequence per account (like ORD-NN and CN-NN), never reused
--     (voided invoices keep theirs). Replaces MMDDYYYY(-n) for new invoices; existing numbers stay as they are.
--  2. Via an intermediary the client pays the intermediary in EUR, and the intermediary pays US in USD: every amount we
--     expect and confirm is in USD against OUR invoice. The intermediary's invoice (number, EUR amount, file) is a
--     reference added on the order when it arrives.
--  3. Deposit: usually 10 % reaches us; sometimes (small deposits, "usually under US$5k") the intermediary keeps it and
--     sends us 100 % when the order is ready → order flag deposit_with_intermediary: deposit expected from us = 0, the
--     balance = 100 %, and the order may move to Deposit paid without a deposit payment.

-- 1 -----------------------------------------------------------------------------
create function public.invoice_next_number_for(p_account uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text; v_n int; v_no text;
begin
  select code into v_code from public.accounts where id = p_account;
  select count(*) + 1 into v_n from public.invoices where account_id = p_account;
  loop
    v_no := v_code || '-INV-' || lpad(v_n::text, 2, '0');
    exit when not exists (select 1 from public.invoices where number = v_no);
    v_n := v_n + 1;
  end loop;
  return v_no;
end;
$$;
revoke execute on function public.invoice_next_number_for(uuid) from public, anon, authenticated;

create or replace function public.invoices_before_write()
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
    if new.number = '' then new.number := public.invoice_next_number_for(new.account_id); end if;
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

-- 2 + 3 -------------------------------------------------------------------------
alter table public.orders add column deposit_with_intermediary boolean not null default false;
grant update (deposit_with_intermediary) on public.orders to authenticated;

create or replace view public.order_overview
with (security_invoker = true)
as
select o.id, o.account_id, o.number, o.status, o.order_date, o.pieces, o.total_usd, o.eta_date, o.updated_at,
       o.delivery_setup,
       a.code as account_code, a.name as account_name, a.market,
       (o.partner_invoice_eur is not null) as pays_in_eur,           -- the client pays an intermediary invoice in EUR (reference)
       o.total_usd as payable_total,                                   -- what reaches us, in USD
       case when o.deposit_with_intermediary then 0 else o.deposit_due_usd end as deposit_payable,
       coalesce((select sum(p.amount) from public.payments p
                  where p.order_id = o.id and p.type = 'deposit' and p.status = 'confirmed'), 0) as deposit_confirmed,
       coalesce((select sum(p.amount) from public.payments p
                  where p.order_id = o.id and p.type = 'balance' and p.status = 'confirmed'), 0) as balance_confirmed,
       exists (select 1 from public.payments p where p.order_id = o.id and p.status = 'awaiting_confirmation') as payment_awaiting,
       (o.status >= 'balance_paid'
         or exists (select 1 from public.payments p where p.order_id = o.id and p.type = 'balance' and p.status = 'confirmed'))
         as balance_ok,
       (select count(*) from public.imei_master i where i.order_id = o.id)::int as imei_count,
       case o.delivery_setup
         when 'client_label' then exists (select 1 from public.files f
                                           where f.owner_table = 'orders' and f.owner_id = o.id and f.kind = 'LABEL')
         else coalesce(o.courier, '') <> '' end as label_ok,
       o.deposit_with_intermediary
  from public.orders o join public.accounts a on a.id = o.account_id;

create or replace function public.orders_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_steps text[] := enum_range(null::public.order_status)::text[];
  v_from int; v_to int;
  ov record;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  v_from := array_position(v_steps, old.status::text);
  v_to := array_position(v_steps, new.status::text);
  -- auth.uid() is null for system jobs (SQL editor, cron): no restriction
  if (select auth.uid()) is not null and not v_admin then
    if v_to <> v_from + 1 then
      raise exception 'Orders move one step at a time (% → %). Ask an admin to correct a status.',
        old.status, new.status using errcode = '23514';
    end if;
  end if;
  if v_to > v_from then
    select * into ov from public.order_overview where id = new.id;
    if new.status = 'deposit_paid' and ov.deposit_confirmed <= 0 and not new.deposit_with_intermediary and not v_admin then
      raise exception 'Deposit paid needs a deposit confirmed by an admin.' using errcode = '23514';
    end if;
    if new.status = 'balance_paid' and ov.balance_confirmed <= 0 and not v_admin then
      raise exception 'Balance paid needs a balance confirmed by an admin.' using errcode = '23514';
    end if;
    if new.status = 'shipped' then
      if not ov.balance_ok then
        raise exception 'Not clear to ship: the balance is not confirmed.' using errcode = '23514';
      end if;
      if ov.imei_count = 0 then
        raise exception 'Not clear to ship: load the IMEI file first.' using errcode = '23514';
      end if;
      if not ov.label_ok then
        raise exception 'Not clear to ship: upload the client label or enter the courier booking.' using errcode = '23514';
      end if;
      if coalesce(new.tracking, '') = '' then
        raise exception 'Enter the AWB / tracking number before marking Shipped.' using errcode = '23514';
      end if;
      new.ship_date := coalesce(new.ship_date, current_date);
    end if;
    if new.status = 'delivered' then
      new.delivered_date := coalesce(new.delivered_date, current_date);
    end if;
  end if;
  return new;
end;
$$;

-- payments to us are always USD (wire or USDT), also when an intermediary pays
create or replace function public.payments_currency_usd()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.currency := 'USD';
  return new;
end;
$$;
create trigger payments_currency_usd
  before insert on public.payments
  for each row execute function public.payments_currency_usd();
revoke execute on function public.payments_currency_usd() from public, anon, authenticated;

create or replace view public.order_cycle
with (security_invoker = true)
as
with base as (
  select o.id, o.account_id, o.number, o.status, o.order_date, o.ship_date, o.pieces, o.total_usd,
         (o.partner_invoice_eur is not null) as pays_in_eur,
         o.total_usd as payable,  -- we are paid in USD (also via an intermediary, Nov 2 2026)
         coalesce((select min(e.created_at)::date from public.order_events e
                    where e.order_id = o.id and e.to_status = 'invoiced'), o.order_date) as invoiced_on,
         (select min(p.confirmed_at)::date from public.payments p
           where p.order_id = o.id and p.type = 'deposit' and p.status = 'confirmed') as deposit_on,
         coalesce((select sum(p.amount) from public.payments p
                    where p.order_id = o.id and p.status = 'confirmed'), 0) as confirmed,
         (select max(p.confirmed_at)::date from public.payments p
           where p.order_id = o.id and p.status = 'confirmed') as last_payment_on
    from public.orders o
   where o.status >= 'invoiced'
)
select b.id, b.account_id, b.number, b.status, b.order_date, b.ship_date, b.pieces, b.total_usd, b.pays_in_eur, b.payable,
       b.invoiced_on, b.deposit_on, b.confirmed,
       (b.status >= 'balance_paid' or b.confirmed >= b.payable - 0.01) as fully_paid,
       case when b.status >= 'balance_paid' or b.confirmed >= b.payable - 0.01 then b.last_payment_on end as paid_on,
       case when b.status >= 'balance_paid' then 0 else greatest(b.payable - b.confirmed, 0) end as outstanding,
       case when b.deposit_on is not null and b.ship_date is not null and b.ship_date >= b.deposit_on
            then b.ship_date - b.deposit_on end as processing_days,
       case when (b.status >= 'balance_paid' or b.confirmed >= b.payable - 0.01) and b.last_payment_on is not null
            then greatest(b.last_payment_on - b.invoiced_on, 0) end as cash_cycle_days
  from base b;

create or replace view public.portal_orders as
with p as (
  select o.*, o.total_usd as payable,
         coalesce((select sum(x.amount) from public.payments x
                    where x.order_id = o.id and x.type = 'deposit' and x.status = 'confirmed'), 0) as dep_ok,
         coalesce((select sum(x.amount) from public.payments x
                    where x.order_id = o.id and x.type = 'balance' and x.status = 'confirmed'), 0) as bal_ok
    from public.orders o
   where o.account_id = public.portal_account_id() and o.status <> 'quoted'
)
select p.id, p.number, p.status, p.order_date, p.pieces, p.total_usd,
       (p.partner_invoice_eur is not null) as pays_in_eur, p.payable as payable_total,
       case when p.deposit_with_intermediary then 0 else p.deposit_due_usd end as deposit_payable,
       p.dep_ok as deposit_confirmed, p.bal_ok as balance_confirmed,
       case when p.status >= 'balance_paid' then 0 else greatest(p.payable - p.dep_ok - p.bal_ok, 0) end as balance_pending,
       exists (select 1 from public.payments x where x.order_id = p.id and x.status = 'awaiting_confirmation') as payment_awaiting,
       (select count(*) from public.imei_master i where i.order_id = p.id)::int as imei_count,
       p.hk_invoice_no, p.partner_invoice_no, p.partner_invoice_eur, p.payment_method, p.eta_date, p.ship_date,
       p.courier, p.tracking, p.delivered_date, p.freight_usd, p.customs_usd, p.rma_discount_usd, p.usdt_fee_usd,
       p.battery_line_usd, p.subtotal_usd, p.deposit_with_intermediary
  from p;

