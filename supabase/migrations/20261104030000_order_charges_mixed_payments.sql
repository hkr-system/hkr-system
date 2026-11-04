-- Order charges and mixed payments (Gabriel, Nov 4 2026).
--
-- A. Shipping and customs, each in one of two ways per order:
--      'unit'  = US$ per unit × the units of the order (follows the quantities when lines change)
--      'total' = one amount for the whole shipment (as before; every existing order stays 'total').
--    Other charges: rows "description + amount" on the order, printed one per line on the invoice. A positive amount is an
--    extra charge (like a debit note: "Shipping not charged on INV-01"); a negative amount is a discount given without a
--    credit note. They count in the invoice total, the 10 % deposit and the USDT fee, exactly like freight.
--
-- B. Mixed payment (part USDT, part wire): order payment method 'mixed'. No USDT fee line on the invoice; each USDT payment
--    carries its own 0.85 % on the part of the invoice it covers. Example (Gabriel confirmed): balance US$10,000, US$5,000 of it
--    in USDT → expected 5,042.50. Arrives 5,042.50: covers 5,000, fee 42.50 received. Arrives 5,000: covers 5,000 and 42.50 is a
--    FINANCIAL LOSS (never asked from the client again). Arrives 4,900: loss 42.50 and US$100 still due.
--    payments.amount stays "what the payment pays of the invoice", so every balance, dashboard and report keeps working;
--    received_usd is what actually arrived. Financial losses lower the order's gross margin (Gabriel).
--    Orders paid 100 % in USDT keep the "USDT Fee (0.85 %)" invoice line as before.

alter type public.payment_method add value if not exists 'mixed';

-- -----------------------------------------------------------------------------
-- A. Shipping / customs per unit or total, other charges
-- -----------------------------------------------------------------------------
alter table public.orders
  add column freight_mode     text not null default 'total' check (freight_mode in ('unit', 'total')),
  add column freight_unit_usd numeric(12, 2) check (freight_unit_usd >= 0),
  add column customs_mode     text not null default 'total' check (customs_mode in ('unit', 'total')),
  add column customs_unit_usd numeric(12, 2) check (customs_unit_usd >= 0),
  add column charges_usd      numeric(12, 2) not null default 0;      -- Σ order_charges (trigger), may be negative

create table public.order_charges (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  account_id  uuid not null references public.accounts (id) on delete cascade,   -- copied from the order (RLS)
  description text not null check (btrim(description) <> ''),
  qty         integer check (qty > 0),                                          -- optional: qty × unit
  unit_usd    numeric(12, 2),
  amount_usd  numeric(12, 2) not null check (amount_usd <> 0),                  -- + charge · − discount
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
create index order_charges_order_idx on public.order_charges (order_id, sort_order);
select public.setup_table('public.order_charges');

create policy order_charges_read on public.order_charges
  for select to authenticated using ((select public.has_account_access(account_id)));
create policy order_charges_insert on public.order_charges
  for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id and public.has_account_access(o.account_id)));
create policy order_charges_update on public.order_charges
  for update to authenticated
  using ((select public.has_account_access(account_id))) with check ((select public.has_account_access(account_id)));
create policy order_charges_delete on public.order_charges
  for delete to authenticated using ((select public.has_account_access(account_id)));

create function public.order_charges_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select o.account_id into new.account_id from public.orders o where o.id = new.order_id;
  if new.qty is not null and new.unit_usd is not null then
    new.amount_usd := round(new.qty * new.unit_usd, 2);   -- qty × unit is never typed twice
  end if;
  return new;
end;
$$;
create trigger order_charges_before_write
  before insert or update on public.order_charges
  for each row execute function public.order_charges_before_write();
revoke execute on function public.order_charges_before_write() from public, anon, authenticated;

create function public.order_charges_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.order_recalc(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;
create trigger order_charges_after_change
  after insert or update or delete on public.order_charges
  for each row execute function public.order_charges_after_change();
revoke execute on function public.order_charges_after_change() from public, anon, authenticated;

-- Totals (same rules as src/lib/orders/calc.ts): per-unit shipping / customs follow the units; other charges added;
-- the USDT fee line only when the whole order is paid in USDT (a mixed order pays the fee on each USDT payment).
create or replace function public.order_recalc(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_sub numeric; v_batt numeric; v_pcs int; v_base numeric; v_fee numeric; v_total numeric; v_dep numeric;
  v_separate boolean; v_freight numeric; v_customs numeric; v_charges numeric;
begin
  select ord.*, coalesce((ord.invoice_format ->> 'battery_line_separate')::boolean,
                         (a.invoice_format ->> 'battery_line_separate')::boolean, true) as sep
    into o
    from public.orders ord join public.accounts a on a.id = ord.account_id
   where ord.id = p_order;
  if not found then return; end if;
  v_separate := o.sep;
  select coalesce(sum(l.qty * l.unit_price_usd), 0),
         coalesce(sum(case when v_separate and l.battery_new
                                and coalesce(s.battery_eligible, coalesce(l.model, '') !~* 'iphone 16', true)
                           then l.qty * l.battery_unit_usd else 0 end), 0),
         coalesce(sum(l.qty), 0)
    into v_sub, v_batt, v_pcs
    from public.order_lines l left join public.skus s on s.id = l.sku_id
   where l.order_id = p_order;
  v_freight := case when o.freight_mode = 'unit' then round(coalesce(o.freight_unit_usd, 0) * v_pcs, 2) else o.freight_usd end;
  v_customs := case when o.customs_mode = 'unit' then round(coalesce(o.customs_unit_usd, 0) * v_pcs, 2) else o.customs_usd end;
  select coalesce(sum(c.amount_usd), 0) into v_charges from public.order_charges c where c.order_id = p_order;
  v_base := v_sub + v_batt + v_freight + v_customs + v_charges - o.rma_discount_usd;
  v_fee := case when o.payment_method::text = 'usdt'
                then round(v_base * public.setting_num('usdt_fee_pct', 0.85) / 100, 2) else 0 end;
  v_total := v_base + v_fee;
  v_dep := round(v_total * public.setting_num('deposit_pct', 10) / 100, 2);
  update public.orders
     set subtotal_usd = v_sub, battery_line_usd = v_batt, pieces = v_pcs, usdt_fee_usd = v_fee,
         freight_usd = v_freight, customs_usd = v_customs, charges_usd = v_charges,
         total_usd = v_total, deposit_due_usd = v_dep, balance_due_usd = v_total - v_dep
   where id = p_order
     and (subtotal_usd, battery_line_usd, pieces, usdt_fee_usd, freight_usd, customs_usd, charges_usd,
          total_usd, deposit_due_usd, balance_due_usd)
         is distinct from (v_sub, v_batt, v_pcs, v_fee, v_freight, v_customs, v_charges, v_total, v_dep, v_total - v_dep);
end;
$$;

drop trigger orders_after_amounts on public.orders;
create trigger orders_after_amounts
  after insert or update of freight_usd, customs_usd, rma_discount_usd, payment_method, invoice_format,
    freight_mode, freight_unit_usd, customs_mode, customs_unit_usd on public.orders
  for each row execute function public.orders_after_amounts();

-- -----------------------------------------------------------------------------
-- B. Mixed payments: USDT fee per payment, financial loss
-- -----------------------------------------------------------------------------
alter table public.payments
  add column received_usd      numeric(12, 2),   -- what actually arrived (amount = what it pays of the invoice)
  add column usdt_covers_usd   numeric(12, 2) check (usdt_covers_usd > 0),
  add column usdt_fee_usd      numeric(12, 2),   -- 0.85 % of the part covered
  add column usdt_fee_lost_usd numeric(12, 2);   -- fee that did not arrive = financial loss

-- runs before payments_before_write (alphabetical), so the expected amount / difference use the part that pays the invoice
create function public.payments_before_usdt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method text; v_pct numeric; v_fee numeric; v_got numeric;
begin
  if new.method::text = 'mixed' then
    raise exception 'A payment is either wire or USDT: record a mixed payment as two payments.' using errcode = '23514';
  end if;
  select o.payment_method::text into v_method from public.orders o where o.id = new.order_id;
  new.received_usd := new.amount;
  if v_method = 'mixed' and new.method::text = 'usdt' then
    v_pct := public.setting_num('usdt_fee_pct', 0.85);
    -- without a "covers" amount the payment is taken as covers + fee
    new.usdt_covers_usd := coalesce(new.usdt_covers_usd, round(new.amount / (1 + v_pct / 100), 2));
    v_fee := round(new.usdt_covers_usd * v_pct / 100, 2);
    v_got := least(v_fee, greatest(0, new.amount - new.usdt_covers_usd));
    new.usdt_fee_usd := v_fee;
    new.usdt_fee_lost_usd := v_fee - v_got;
    new.amount := new.amount - v_got;
  else
    new.usdt_covers_usd := null; new.usdt_fee_usd := null; new.usdt_fee_lost_usd := null;
  end if;
  return new;
end;
$$;
create trigger payments_before_usdt
  before insert on public.payments
  for each row execute function public.payments_before_usdt();
revoke execute on function public.payments_before_usdt() from public, anon, authenticated;

update public.payments set received_usd = amount where received_usd is null;

-- financial losses lower the order's gross margin (confirmed payments only)
alter table public.orders_finance add column financial_loss_usd numeric(12, 2) not null default 0;

create or replace function public.order_finance_recalc(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost numeric; v_real numeric; v_total numeric; v_loss numeric;
begin
  if p_order is null or not exists (select 1 from public.orders where id = p_order) then
    return;
  end if;
  select sum(l.qty * f.base_price_usd) into v_cost
    from public.order_lines l join public.order_lines_finance f on f.order_line_id = l.id
   where l.order_id = p_order;
  v_real := round(v_cost / (1 + public.setting_num('base_margin_pct', 6) / 100), 2);
  select total_usd into v_total from public.orders where id = p_order;
  select coalesce(sum(p.usdt_fee_lost_usd), 0) into v_loss
    from public.payments p where p.order_id = p_order and p.status = 'confirmed';
  insert into public.orders_finance (order_id, base_cost_usd, real_cost_usd, financial_loss_usd, margin_pct)
  values (p_order, v_cost, v_real, v_loss,
          case when v_real is not null and v_total > 0 then round((v_total - v_real - v_loss) / v_total * 100, 3) end)
  on conflict (order_id) do update
    set base_cost_usd = excluded.base_cost_usd, real_cost_usd = excluded.real_cost_usd,
        financial_loss_usd = excluded.financial_loss_usd, margin_pct = excluded.margin_pct;
end;
$$;

create function public.payments_after_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.usdt_fee_lost_usd, old.usdt_fee_lost_usd, 0) <> 0 then
    perform public.order_finance_recalc(coalesce(new.order_id, old.order_id));
  end if;
  return null;
end;
$$;
create trigger payments_after_finance
  after insert or update or delete on public.payments
  for each row execute function public.payments_after_finance();
revoke execute on function public.payments_after_finance() from public, anon, authenticated;

-- sales dashboards: profit = invoice total − real cost − financial losses (same visibility as before)
create or replace function public.sales_orders(p_from date, p_to date)
returns table (
  order_id uuid, account_id uuid, number text, order_date date, status public.order_status,
  total_usd numeric, pieces integer, rma_discount_usd numeric, margin_usd numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.account_id, o.number, o.order_date, o.status, o.total_usd, o.pieces, o.rma_discount_usd,
         case
           when public.is_admin() or (public.current_app_role() = 'bd' and public.has_account_access(o.account_id))
             then o.total_usd - coalesce(f.real_cost_usd, f.base_cost_usd) - coalesce(f.financial_loss_usd, 0)
           else null
         end
    from public.orders o
    left join public.orders_finance f on f.order_id = o.id
   where o.status >= 'invoiced'
     and o.order_date between p_from and p_to
     and public.has_account_access(o.account_id);
$$;

-- -----------------------------------------------------------------------------
-- Columns the order form edits (totals stay trigger-only). Fix: the route (intermediary_id, Nov 3), saved address
-- (address_id, Nov 4) and invoice format (Nov 3) were added without their update grant, so EDITING an order failed.
-- -----------------------------------------------------------------------------
grant update (invoice_format, intermediary_id, address_id, freight_mode, freight_unit_usd, customs_mode, customs_unit_usd)
  on public.orders to authenticated;

-- Client portal: the order's other charges / discounts total (column added at the end of the view)
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
       p.battery_line_usd, p.subtotal_usd, p.deposit_with_intermediary, p.charges_usd
  from p;
