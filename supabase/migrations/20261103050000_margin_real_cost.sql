-- Margin against the REAL cost (Gabriel, Nov 3 2026). The base list already carries the base margin (setting base_margin_pct,
-- 6 %), so real cost = base list price ÷ (1 + 6 %). Margin % = (invoice total − real cost) ÷ invoice total; credit notes stay
-- inside the invoice total of the order where they are applied (Gabriel: "option A, as always").
-- orders_finance.base_cost_usd keeps Σ qty × base list price; real_cost_usd is new. Admin only (RLS of orders_finance).

alter table public.orders_finance add column real_cost_usd numeric(12, 2);

create or replace function public.order_finance_recalc(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost numeric; v_real numeric; v_total numeric;
begin
  if p_order is null or not exists (select 1 from public.orders where id = p_order) then
    return;
  end if;
  select sum(l.qty * f.base_price_usd) into v_cost
    from public.order_lines l join public.order_lines_finance f on f.order_line_id = l.id
   where l.order_id = p_order;
  v_real := round(v_cost / (1 + public.setting_num('base_margin_pct', 6) / 100), 2);
  select total_usd into v_total from public.orders where id = p_order;
  insert into public.orders_finance (order_id, base_cost_usd, real_cost_usd, margin_pct)
  values (p_order, v_cost, v_real,
          case when v_real is not null and v_total > 0 then round((v_total - v_real) / v_total * 100, 3) end)
  on conflict (order_id) do update
    set base_cost_usd = excluded.base_cost_usd, real_cost_usd = excluded.real_cost_usd, margin_pct = excluded.margin_pct;
end;
$$;
revoke execute on function public.order_finance_recalc(uuid) from public, anon, authenticated;

-- every existing order again (derived figures only)
select public.order_finance_recalc(o.id) from public.orders o where exists (select 1 from public.orders_finance f where f.order_id = o.id);

-- sales dashboards: profit = invoice total − real cost (admin all; a bd her own accounts — unchanged rule)
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
           when public.is_admin() then o.total_usd - coalesce(f.real_cost_usd, f.base_cost_usd)
           when public.current_app_role() = 'bd' and public.has_account_access(o.account_id) then o.total_usd - coalesce(f.real_cost_usd, f.base_cost_usd)
           else null
         end
    from public.orders o
    left join public.orders_finance f on f.order_id = o.id
   where o.status >= 'invoiced'
     and o.order_date between p_from and p_to
     and public.has_account_access(o.account_id);
$$;
