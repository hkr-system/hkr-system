-- Intermediary orders (pgTAP, Nov 2 2026): we are paid in USD against OUR invoice; the EUR invoice is a reference;
-- when the intermediary keeps the deposit we expect 0 deposit and 100 % balance, and the order may move to Deposit paid.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@im.local', '', now(), now() from ids;
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;

insert into public.accounts (code, name, market, intermediary_id) select 'IMT-NL-601', 'Via partner', 'EU', id from public.intermediaries limit 1;
insert into public.orders (account_id, order_date, status) select id, '2031-03-01', 'invoiced' from public.accounts where code = 'IMT-NL-601';
create temp table o as select id from public.orders where account_id = (select id from public.accounts where code = 'IMT-NL-601');
grant select on o to authenticated;
insert into public.order_lines (order_id, description, qty, unit_price_usd) select id, 'x', 10, 400 from o;

select pg_temp.login('as');
update public.orders set partner_invoice_no = 'GC-1', partner_invoice_eur = 3700 where id = (select id from o);
select is((select payable_total::text || '/' || deposit_payable::text from public.order_overview where id = (select id from o)), '4000.00/400.00',
  'with an EUR invoice we still expect USD: total 4,000, deposit 400');
select lives_ok($$update public.orders set deposit_with_intermediary = true where id = (select id from o)$$, 'specialist marks: deposit kept by the intermediary');
select is((select deposit_payable::text from public.order_overview where id = (select id from o)), '0', 'no deposit expected from the intermediary');
select lives_ok($$update public.orders set status = 'deposit_paid' where id = (select id from o)$$, 'specialist moves to Deposit paid without a deposit payment');
insert into public.payments (order_id, type, amount) select id, 'balance', 4000 from o;
select is((select currency::text || ' ' || expected_amount::text || ' diff ' || difference::text from public.payments where order_id = (select id from o)),
  'USD 4000.00 diff 0.00', 'the balance expected is 100 % in USD');

-- without the flag a non-admin still needs a confirmed deposit
select pg_temp.login('as');
insert into public.orders (account_id, order_date, status) select id, '2031-03-02', 'invoiced' from public.accounts where code = 'IMT-NL-601';
select throws_ok($$update public.orders set status = 'deposit_paid' where order_date = '2031-03-02' and account_id = (select id from public.accounts where code = 'IMT-NL-601')$$,
  '23514', null, 'normal order: Deposit paid still needs a confirmed deposit');
select is((select count(*)::int from public.order_overview where account_id = (select id from public.accounts where code = 'IMT-NL-601') and pays_in_eur), 1,
  'pays_in_eur only flags an order with an intermediary invoice');

select * from finish();
rollback;
