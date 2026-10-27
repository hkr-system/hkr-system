-- Phase 3 tests (pgTAP): accounts, orders, payments, finance isolation, IMEI, WhatsApp link.
-- Run with: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean after Phase 3');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('bd2', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@p3.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id in (select id from ids where name in ('bd', 'bd2'));
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Fixtures: two accounts, bd owns only the first
insert into public.accounts (code, name, country, market, payment_method)
values ('TST-NL-001', 'Test One', 'NL', 'EU', 'wire'), ('TSU-MX-002', 'Test Usdt', 'MX', 'LATAM', 'usdt');
insert into public.account_assignments (account_id, user_id, role_on_account)
select id, (select id from ids where name = 'bd'), 'owner' from public.accounts where code = 'TST-NL-001';

select is((select value #>> '{}' from public.settings where key = 'account_code_last_seq'), '2',
          'client code sequence follows the highest real code');
select throws_ok($$insert into public.accounts (code, name) values ('BAD-CODE', 'x')$$, '23514', null,
                 'client code must be AAA-CC-NNN');

-- 1. Order numbering and totals (10/90, USDT 0.85 %)
insert into public.orders (account_id, payment_method) select id, 'wire' from public.accounts where code = 'TST-NL-001';
insert into public.orders (account_id, payment_method) select id, 'wire' from public.accounts where code = 'TST-NL-001';
select is((select string_agg(number, ',' order by number) from public.orders o join public.accounts a on a.id = o.account_id
            where a.code = 'TST-NL-001'), 'ORD-01,ORD-02', 'order numbers ORD-NN per account');

insert into public.order_lines (order_id, sku_id, qty, unit_price_usd, battery_new, battery_unit_usd)
select o.id, (select id from public.skus where model = 'iPhone 13' limit 1), 100, 200, true, 8
  from public.orders o join public.accounts a on a.id = o.account_id where a.code = 'TST-NL-001' and o.number = 'ORD-01';
select is((select total_usd from public.orders o join public.accounts a on a.id = o.account_id
            where a.code = 'TST-NL-001' and o.number = 'ORD-01'), 20800.00::numeric,
          'total = 100 × 200 + separate battery line 100 × 8');
select is((select deposit_due_usd || '/' || balance_due_usd from public.orders o join public.accounts a on a.id = o.account_id
            where a.code = 'TST-NL-001' and o.number = 'ORD-01'), '2080.00/18720.00', 'deposit 10 %, balance 90 %');

insert into public.orders (account_id, payment_method) select id, 'usdt' from public.accounts where code = 'TSU-MX-002';
insert into public.order_lines (order_id, sku_id, qty, unit_price_usd)
select o.id, (select id from public.skus where model = 'iPhone 15' limit 1), 100, 200
  from public.orders o join public.accounts a on a.id = o.account_id where a.code = 'TSU-MX-002';
select is((select usdt_fee_usd || '/' || total_usd from public.orders o join public.accounts a on a.id = o.account_id
            where a.code = 'TSU-MX-002'), '170.00/20170.00', 'USDT adds a 0.85 % fee line');

update public.accounts set invoice_format = invoice_format || '{"battery_line_separate": false}' where code = 'TST-NL-001';
update public.orders set freight_usd = 0 where number = 'ORD-01'
   and account_id = (select id from public.accounts where code = 'TST-NL-001');
select is((select battery_line_usd from public.orders o join public.accounts a on a.id = o.account_id
            where a.code = 'TST-NL-001' and o.number = 'ORD-01'), 0.00::numeric, 'absorbed battery format: no separate line');

-- 2. Access: bd sees only own accounts; specialist sees all; finance is admin only
insert into public.order_lines_finance (order_line_id, base_price_usd)
select l.id, 180 from public.order_lines l join public.accounts a on a.id = l.account_id where a.code like 'TS%';

select pg_temp.login('bd');
select is((select count(*)::int from public.accounts where code like 'TS%'), 1, 'bd sees only the account they own');
select is((select count(*)::int from public.orders o join public.accounts a on a.id = o.account_id where a.code like 'TS%'), 2,
          'bd sees only orders of own accounts');
select is((select count(*)::int from public.orders_finance), 0, 'bd reads no order finance');
select is((select count(*)::int from public.order_lines_finance), 0, 'bd reads no line base prices');
select throws_ok($$update public.orders set total_usd = 1$$, '42501', null, 'totals cannot be typed');

select pg_temp.login('as');
select is((select count(*)::int from public.accounts where code like 'TS%'), 2, 'specialist sees all accounts');
select is((select count(*)::int from public.orders_finance), 0, 'specialist reads no order finance (API too)');
select is((select count(*)::int from public.order_lines_finance), 0, 'specialist reads no base prices');
select lives_ok($$insert into public.accounts (code, name) values ('NEW-ES-003', 'New Spain')$$, 'specialist creates an account (P1)');
select throws_ok($$update public.accounts set code = 'NEW-ES-099' where code = 'NEW-ES-003'$$, '42501', null,
                 'only admin changes a client code');

select pg_temp.login('admin');
select ok((select count(*) from public.orders_finance) > 0, 'admin reads order finance');
select ok((select margin_pct from public.orders_finance f join public.orders o on o.id = f.order_id
            join public.accounts a on a.id = o.account_id where a.code = 'TST-NL-001' and o.number = 'ORD-01') > 0,
          'margin computed from base prices');

-- 3. Status flow and payments (specialist records, admin confirms)
select pg_temp.login('as');
update public.orders set status = 'invoiced' where number = 'ORD-01' and account_id = (select id from public.accounts where code = 'TST-NL-001');
select throws_ok($$update public.orders set status = 'in_preparation'
                   where number = 'ORD-01' and account_id = (select id from public.accounts where code = 'TST-NL-001')$$,
                 '23514', null, 'orders move one step at a time');
select throws_ok($$update public.orders set status = 'deposit_paid'
                   where number = 'ORD-01' and account_id = (select id from public.accounts where code = 'TST-NL-001')$$,
                 '23514', null, 'Deposit paid needs a confirmed deposit');
insert into public.payments (order_id, type, amount, method)
select o.id, 'deposit', 1950, 'wire' from public.orders o join public.accounts a on a.id = o.account_id
 where a.code = 'TST-NL-001' and o.number = 'ORD-01';
select is((select difference from public.payments p join public.orders o on o.id = p.order_id where o.number = 'ORD-01'
            and o.account_id = (select id from public.accounts where code = 'TST-NL-001')), -50.00::numeric,
          'difference vs the deposit due is computed');
update public.payments set status = 'confirmed';
select is((select count(*)::int from public.payments where status = 'confirmed' and account_id in (select id from public.accounts where code like 'TS%')), 0,
          'specialist cannot confirm a payment');

select pg_temp.login('admin');
update public.payments set status = 'confirmed', difference_reason = 'short_payment'
 where account_id in (select id from public.accounts where code like 'TS%');
select is((select o.status::text from public.orders o join public.accounts a on a.id = o.account_id
            where a.code = 'TST-NL-001' and o.number = 'ORD-01'), 'deposit_paid', 'admin confirmation moves the order to Deposit paid');
select ok(exists (select 1 from public.order_events e join public.orders o on o.id = e.order_id
                   where o.number = 'ORD-01' and e.to_status = 'deposit_paid'), 'status change logged');

update public.orders set status = 'ready_to_ship' where number = 'ORD-01'
   and account_id = (select id from public.accounts where code = 'TST-NL-001');
update public.orders set status = 'balance_paid' where number = 'ORD-01'
   and account_id = (select id from public.accounts where code = 'TST-NL-001');
select throws_ok($$update public.orders set status = 'shipped', tracking = 'X'
                   where number = 'ORD-01' and account_id = (select id from public.accounts where code = 'TST-NL-001')$$,
                 '23514', null, 'not clear to ship without IMEIs and label');

-- 4. IMEI master
select throws_ok($$insert into public.imei_master (imei, account_id) select '12345', id from public.accounts where code = 'TST-NL-001'$$,
                 '23514', null, 'IMEI must have 15 digits');

-- 5. WhatsApp: a client contact writing in is linked to the account, no lead created
select pg_temp.logout();
insert into public.contacts (account_id, name, phone_e164) select id, 'Client Buyer', '+31699000111' from public.accounts where code = 'TST-NL-001';
select public.wa_ingest($json$
{"object":"whatsapp_business_account","entry":[{"id":"WABA","changes":[{"field":"messages","value":{
 "messaging_product":"whatsapp","metadata":{"display_phone_number":"31600000000","phone_number_id":"P3-PNID"},
 "contacts":[{"profile":{"name":"Client Buyer"},"wa_id":"31699000111"}],
 "messages":[{"from":"31699000111","id":"wamid.P3IN","timestamp":"1761570000","type":"text","text":{"body":"Order status?"}}]}}]}]}
$json$::jsonb);
select is((select a.code from public.wa_conversations c join public.accounts a on a.id = c.account_id
            where c.contact_phone = '+31699000111'), 'TST-NL-001', 'client chat linked to the account');
select is((select count(*)::int from public.leads where phone_e164 = '+31699000111'), 0, 'no lead created for a client contact');

select * from finish();
rollback;
