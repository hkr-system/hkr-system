-- Invoice format per ORDER (Gabriel, Nov 3 2026): the format can change from one invoice to the next for the same client.
-- The account keeps a default; a new order copies it and the order form can change it. The order's format decides the
-- separate "New battery cell" line (totals), CE text and plain lines on its invoice.

alter table public.orders add column invoice_format jsonb;

-- existing orders take their account's current format (nothing changes for them)
update public.orders o set invoice_format = coalesce(a.invoice_format, '{}'::jsonb)
  from public.accounts a where a.id = o.account_id and o.invoice_format is null;

create function public.orders_invoice_format_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invoice_format is null or new.invoice_format = '{}'::jsonb then
    select coalesce(a.invoice_format, '{}'::jsonb) into new.invoice_format from public.accounts a where a.id = new.account_id;
  end if;
  return new;
end;
$$;
create trigger orders_invoice_format_default
  before insert on public.orders
  for each row execute function public.orders_invoice_format_default();
revoke execute on function public.orders_invoice_format_default() from public, anon, authenticated;

-- totals: the battery line follows the ORDER's format (the account's only as a fallback)
create or replace function public.order_recalc(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_sub numeric; v_batt numeric; v_pcs int; v_base numeric; v_fee numeric; v_total numeric; v_dep numeric;
  v_separate boolean;
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
  v_base := v_sub + v_batt + o.freight_usd + o.customs_usd - o.rma_discount_usd;
  v_fee := case when o.payment_method = 'usdt'
                then round(v_base * public.setting_num('usdt_fee_pct', 0.85) / 100, 2) else 0 end;
  v_total := v_base + v_fee;
  v_dep := round(v_total * public.setting_num('deposit_pct', 10) / 100, 2);
  update public.orders
     set subtotal_usd = v_sub, battery_line_usd = v_batt, pieces = v_pcs, usdt_fee_usd = v_fee,
         total_usd = v_total, deposit_due_usd = v_dep, balance_due_usd = v_total - v_dep
   where id = p_order
     and (subtotal_usd, battery_line_usd, pieces, usdt_fee_usd, total_usd, deposit_due_usd, balance_due_usd)
         is distinct from (v_sub, v_batt, v_pcs, v_fee, v_total, v_dep, v_total - v_dep);
end;
$$;

drop trigger orders_after_amounts on public.orders;
create trigger orders_after_amounts
  after insert or update of freight_usd, customs_usd, rma_discount_usd, payment_method, invoice_format on public.orders
  for each row execute function public.orders_after_amounts();
