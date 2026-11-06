-- eSIM only (pgTAP, Nov 6 2026): allowed on iPhone 14–16 lines, refused on other models; same price (no total change).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
insert into public.accounts (code, name, market) values ('SIM-GT-851', 'SIM A', 'LATAM');
insert into public.orders (account_id, order_date) select id, current_date from public.accounts where code = 'SIM-GT-851';
create temp view o as select o.* from public.orders o join public.accounts a on a.id = o.account_id where a.code = 'SIM-GT-851';
select lives_ok($$insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed, sim_option)
  values ((select id from o), 'iPhone 15', 128, 5, 400, true, 'esim')$$, 'eSIM only on an iPhone 15 line');
select lives_ok($$insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed, sim_option)
  values ((select id from o), 'iPhone 15', 128, 5, 400, true, null)$$, 'the same model with Physical SIM + eSIM');
select throws_ok($$insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed, sim_option)
  values ((select id from o), 'iPhone 13', 128, 5, 400, true, 'esim')$$, '23514', null, 'eSIM only refused on an iPhone 13');
select is((select subtotal_usd from o), 4000.00::numeric, 'same price: 10 × 400');
select * from finish();
rollback;
