-- =============================================================================
-- HKR System — demo sales history for the dashboards: ~36 closed orders over the last
-- 11 months on the 4 demo accounts (codes 9xx). Demo prices only. Safe on hosted;
-- running it twice does nothing the second time. Run after seed_phase3.sql.
-- =============================================================================
do $$
declare
  v_order uuid; v_line uuid; a record; m int; k int; v_sku uuid; v_qty int; v_price numeric; v_batt boolean;
  v_skus uuid[] := array(select id from public.skus order by model, storage_gb);
begin
  if not exists (select 1 from public.accounts where is_demo) then
    raise notice 'Run seed_phase3.sql first.';
    return;
  end if;
  if exists (select 1 from public.orders o join public.accounts ac on ac.id = o.account_id
              where ac.is_demo and o.order_date < current_date - 100) then
    return; -- already seeded
  end if;
  for a in select id, code, payment_method, delivery_setup from public.accounts where is_demo order by code loop
    for m in 3..11 loop
      -- not every account orders every month: a simple, repeatable pattern
      continue when (m + length(a.code) + ascii(substr(a.code, 1, 1))) % 3 = 0;
      insert into public.orders (account_id, status, order_date, payment_method, delivery_setup, hk_invoice_no,
                                 ship_date, delivered_date, tracking, courier, notes)
      values (a.id, 'closed', (date_trunc('month', current_date) - make_interval(months => m))::date + (m * 3 % 25),
              a.payment_method, a.delivery_setup, 'DEMO-' || m, current_date - m * 30 + 10, current_date - m * 30 + 16,
              'DEMO', 'DHL', 'Demo history order')
      returning id into v_order;
      for k in 1..2 loop
        v_sku := v_skus[1 + ((m + k + ascii(substr(a.code, 2, 1))) % array_length(v_skus, 1))];
        v_qty := 60 + ((m * 37 + k * 53 + ascii(substr(a.code, 3, 1))) % 140);
        select case when s.model like 'iPhone 16%' then 0 else 1 end = 1,
               case s.model when 'iPhone 13' then 142 when 'iPhone 14 Pro' then 265 when 'iPhone 15' then 184
                            when 'iPhone 16' then 240 else 520 end + (m % 4)
          into v_batt, v_price from public.skus s where s.id = v_sku;
        insert into public.order_lines (order_id, sku_id, qty, unit_price_usd, battery_new, battery_unit_usd)
        values (v_order, v_sku, v_qty, v_price, v_batt, case when v_batt then 10 else 0 end)
        returning id into v_line;
        insert into public.order_lines_finance (order_line_id, base_price_usd)
        values (v_line, round(v_price / (1.05 + (m % 3) * 0.01), 2));
      end loop;
    end loop;
  end loop;
end $$;
