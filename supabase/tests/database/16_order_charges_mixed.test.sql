-- Order charges and mixed payments (pgTAP, Nov 4 2026): shipping/customs per unit follow the units; other charges and
-- discounts count in the total; a mixed order has no USDT fee line; a USDT payment of a mixed order covers its part and
-- the fee that did not arrive is a financial loss that lowers the margin; the order form can edit route/format/address.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean with order charges');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@chg.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;

insert into public.accounts (code, name, market) values ('CHG-GT-841', 'CHG A', 'LATAM');
create temp table a as select id from public.accounts where code = 'CHG-GT-841';
grant select on a to authenticated;

select pg_temp.login('as');
insert into public.orders (account_id, order_date, payment_method, freight_mode, freight_unit_usd, customs_mode, customs_usd)
values ((select id from a), current_date, 'mixed', 'unit', 3, 'total', 100);
create temp view o as select * from public.orders where account_id = (select id from a);
grant select on o to authenticated;
insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed, battery_option)
values ((select id from o), 'S24', 128, 40, 300, true, null), ((select id from o), 'S23', 128, 7, 200, true, null);

select is((select pieces || '/' || freight_usd from o), '47/141.00', 'shipping per unit: 47 units × $3 = $141');
update public.order_lines set qty = 50 where model = 'S24' and order_id = (select id from o);
select is((select freight_usd from o), 171.00::numeric, 'shipping follows the units (57 × $3)');
select is((select customs_usd from o), 100.00::numeric, 'customs as one total stays $100');

insert into public.order_charges (order_id, description, amount_usd) values ((select id from o), 'Shipping not charged on INV-01', 80);
insert into public.order_charges (order_id, description, qty, unit_usd, amount_usd) values ((select id from o), 'Discount', 1, -150, 1);
select is((select charges_usd from o), -70.00::numeric, 'charge +80 and discount qty × unit −150 → −70');
select is((select total_usd from o), (15000 + 1400 + 171 + 100 - 70)::numeric, 'total = products + shipping + customs + charges, no USDT fee (mixed)');
select is((select usdt_fee_usd from o), 0.00::numeric, 'mixed order: no USDT fee line');

-- the order form edits route / format / address / modes (grant fix)
select lives_ok($$update public.orders set invoice_format = '{"plain_lines": true}', intermediary_id = null, address_id = null,
  customs_mode = 'unit', customs_unit_usd = 2 where id = (select id from o)$$, 'the order form can edit format, route, address and modes');
select is((select customs_usd from o), 114.00::numeric, 'customs switched to per unit: 57 × $2');

-- mixed payment: balance part of 5,000 in USDT
select throws_ok($$insert into public.payments (order_id, account_id, type, amount, method) values ((select id from o), (select id from a), 'other', 10, 'mixed')$$,
  '23514', null, 'a single payment cannot be "mixed"');
insert into public.payments (order_id, account_id, type, amount, method, usdt_covers_usd) values ((select id from o), (select id from a), 'balance', 5042.50, 'usdt', 5000);
insert into public.payments (order_id, account_id, type, amount, method, usdt_covers_usd) values ((select id from o), (select id from a), 'balance', 4900, 'usdt', 5000);
select is((select string_agg(amount || '/' || received_usd || '/' || usdt_fee_lost_usd, ', ' order by received_usd desc)
             from public.payments where order_id = (select id from o)),
  '5000.00/5042.50/0.00, 4900.00/4900.00/42.50', 'complete USDT payment covers 5,000; 4,900 covers 4,900 and loses the 42.50 fee');

-- finance: the loss lowers the margin once the payment is confirmed (admin)
select pg_temp.login('admin');
insert into public.order_lines_finance (order_line_id, base_price_usd)
select id, 250 from public.order_lines where order_id = (select id from o);
update public.payments set status = 'confirmed' where order_id = (select id from o);
select is((select financial_loss_usd from public.orders_finance where order_id = (select id from o)), 42.50::numeric,
  'the fee not received is a financial loss of the order');
select is((select round(margin_pct, 2) from public.orders_finance where order_id = (select id from o)),
  (select round((o.total_usd - f.real_cost_usd - 42.50) / o.total_usd * 100, 2) from o, public.orders_finance f where f.order_id = o.id),
  'margin = (total − real cost − loss) ÷ total');
update public.orders set status = 'invoiced' where id = (select id from o);
select is((select margin_usd from public.sales_orders(current_date - 1, current_date + 1) where order_id = (select id from o)),
  (select o.total_usd - f.real_cost_usd - 42.50 from o, public.orders_finance f where f.order_id = o.id),
  'dashboards: profit = total − real cost − financial loss');

select * from finish();
rollback;
