-- Phase 4 + client portal tests (pgTAP): IMEI check, approval rules, credit notes, and that a
-- portal client reads ONLY their own account through the portal_* views and never base tables.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean after Phase 4');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('as', gen_random_uuid()),
  ('client', gen_random_uuid()), ('client2', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@p4.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.system() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into public.accounts (code, name, market) values ('RMA-NL-601', 'Rma A', 'EU'), ('RMB-MX-602', 'Rma B', 'LATAM');
insert into public.account_assignments (account_id, user_id, role_on_account)
select id, (select id from ids where name = 'bd'), 'owner' from public.accounts where code = 'RMA-NL-601';
insert into public.orders (account_id, status, order_date, ship_date) select id, 'shipped', current_date - 30, current_date - 25
  from public.accounts where code in ('RMA-NL-601', 'RMB-MX-602');
insert into public.order_lines (order_id, qty, unit_price_usd, description) select id, 100, 200, 'x' from public.orders o
 where account_id in (select id from public.accounts where code like 'RM_-%');
insert into public.imei_master (imei, order_id, account_id, shipped_at)
select '35900000000001' || n, o.id, o.account_id, current_date - 25
  from public.orders o join public.accounts a on a.id = o.account_id, (values ('0'), ('1')) v(n)
 where a.code = 'RMA-NL-601';
insert into public.imei_master (imei, order_id, account_id, shipped_at)
select '359000000000999', o.id, o.account_id, current_date - 25
  from public.orders o join public.accounts a on a.id = o.account_id where a.code = 'RMB-MX-602';
insert into public.portal_users (user_id, account_id, email)
select (select id from ids where name = 'client'), id, 'client@p4.local' from public.accounts where code = 'RMA-NL-601';
insert into public.portal_users (user_id, account_id, email, active)
select (select id from ids where name = 'client2'), id, 'client2@p4.local', false from public.accounts where code = 'RMB-MX-602';

-- numbering + IMEI check (staff)
select pg_temp.login('as');
insert into public.rmas (account_id, status) select id, 'form_received' from public.accounts where code = 'RMA-NL-601';
select is((select number from public.rmas r join public.accounts a on a.id = r.account_id where a.code = 'RMA-NL-601'),
          'RMA-NL-601-RMA-01', 'RMA number <code>-RMA-NN');
insert into public.rma_units (rma_id, account_id, imei, fault_category)
select r.id, r.account_id, x.imei, 'Camera' from public.rmas r join public.accounts a on a.id = r.account_id,
  (values ('359000000000010'), ('359000000000999'), ('111111111111111')) x(imei) where a.code = 'RMA-NL-601';
select is((select imei_check::text from public.rma_units where imei = '359000000000010'), 'ours', 'own IMEI → OURS');
select is((select imei_check::text from public.rma_units where imei = '359000000000999'), 'not_found', 'IMEI of another client → NOT FOUND');
select is((select check_note from public.rma_units where imei = '359000000000999'), 'IMEI shipped to another account', 'staff see why');
select is((select warranty_ok from public.rma_units where imei = '359000000000010'), true, 'warranty window computed');
select is((select unit_price_usd from public.rma_units where imei = '359000000000010'), null::numeric, 'no SKU → no unit price guessed');
select throws_ok($$ update public.rma_units set resolution = 'credit_note' where imei = '359000000000999' $$,
  '23514', null, 'NOT FOUND cannot get a covered resolution');
select throws_ok($$ insert into public.rma_units (rma_id, account_id, imei, fault_category)
  select r.id, r.account_id, '359000000000010', 'Camera' from public.rmas r where r.number = 'RMA-NL-601-RMA-01' $$, '23505', null, 'same IMEI twice in an RMA (DUPLICATE)');
select throws_ok($$ insert into public.rma_units (rma_id, account_id, imei, fault_category)
  select r.id, r.account_id, '359000000000011', 'Broken' from public.rmas r where r.number = 'RMA-NL-601-RMA-01' $$, '23514', null, 'fault category from the form list only');
update public.rma_units set resolution = 'not_covered' where imei in ('359000000000999', '111111111111111');
update public.rma_units set resolution = 'repair_credit', credit_fixed_usd = 500 where imei = '359000000000010';
select is((select credit_usd from public.rma_units where imei = '359000000000010'), 500.00::numeric, 'fixed credit overrides %');
select is((select cap_usd from public.rma_overview where number = 'RMA-NL-601-RMA-01'), 200.00::numeric, 'cap = invoice × 1 %');
update public.rmas set status = 'verified' where number = 'RMA-NL-601-RMA-01';
select throws_ok($$ update public.rmas set status = 'approved' where number = 'RMA-NL-601-RMA-01' $$,
  '42501', null, 'specialist cannot approve');

select pg_temp.login('admin');
update public.rmas set status = 'approved' where number = 'RMA-NL-601-RMA-01';
select is((select status::text from public.rmas where number = 'RMA-NL-601-RMA-01'), 'approved', 'admin approves above the cap');
select is((select unit_status::text from public.rma_units where imei = '359000000000999'), 'rejected', 'not covered unit → rejected');

select pg_temp.login('as');
select throws_ok($$ update public.rma_units set credit_fixed_usd = 50 where imei = '359000000000010' $$,
  '42501', null, 'after approval only admin changes the credit');

-- credit notes
insert into public.credit_notes (account_id, rma_id, currency, status)
select r.account_id, r.id, 'USD', 'issued' from public.rmas r where r.number = 'RMA-NL-601-RMA-01';
select is((select status::text from public.credit_notes where number = 'RMA-NL-601-CN-01'), 'draft', 'a new credit note is always a draft; number <code>-CN-NN');
insert into public.credit_note_lines (credit_note_id, description, qty, unit_price)
select id, 'Repair credit', 2, 150 from public.credit_notes where number = 'RMA-NL-601-CN-01';
select is((select amount from public.credit_notes where number = 'RMA-NL-601-CN-01'), 300.00::numeric, 'amount = Σ lines');
select throws_ok($$ update public.credit_notes set status = 'approved' where number = 'RMA-NL-601-CN-01' $$,
  '42501', null, 'specialist cannot approve a credit note');
select pg_temp.login('admin');
update public.credit_notes set status = 'approved' where number = 'RMA-NL-601-CN-01';
select pg_temp.login('as');
update public.credit_notes set status = 'issued' where number = 'RMA-NL-601-CN-01';
select is((select unit_status::text from public.rma_units where imei = '359000000000010'), 'credited', 'issued credit note → unit credited');
select throws_ok($$ update public.credit_note_lines set unit_price = 1 where credit_note_id = (select id from public.credit_notes where number = 'RMA-NL-601-CN-01') $$, '42501', null, 'lines locked after approval');

-- bd: own account only, no batches
select pg_temp.login('bd');
select is((select count(*)::int from public.rmas r join public.accounts a on a.id = r.account_id where a.code like 'RM_-%'), 1, 'bd sees RMAs of her account');
select is((select count(*)::int from public.rma_batches), 0, 'bd: no EU batches');

-- the portal client
select pg_temp.login('client');
select is((select code from public.portal_account), 'RMA-NL-601', 'client: own account in the portal');
select is((select count(*)::int from public.rmas) + (select count(*)::int from public.orders) + (select count(*)::int from public.accounts)
          + (select count(*)::int from public.rma_units) + (select count(*)::int from public.files) + (select count(*)::int from public.imei_master)
          + (select count(*)::int from public.credit_notes) + (select count(*)::int from public.orders_finance), 0,
          'client: no access to any base table');
select is((select count(*)::int from public.portal_orders), 1, 'client: own orders only');
select is((select count(*)::int from public.portal_rma_units where imei = '359000000000999' and not imei_found), 1,
          'client: a foreign IMEI only says "not found" (no owner, no note)');
select is((public.portal_check_imei('359000000000999') ->> 'found'), 'false', 'live check never reveals another client''s IMEI');
select is((public.portal_check_imei('359000000000011') ->> 'found'), 'true', 'live check finds own IMEI');
select is((select count(*)::int from public.portal_credit_notes), 1, 'client sees issued credit notes');
select is((public.portal_create_rma('[{"imei":"359000000000011","fault_category":"Camera","source":"testing"}]'::jsonb,
           'with_client', 'ORD-01', 'X', 'x@x', '') ->> 'number'), 'RMA-NL-601-RMA-02', 'client creates an RMA through the portal function');
select is((public.portal_submit_rma((select id from public.portal_rmas where number = 'RMA-NL-601-RMA-02')) ->> 'ok'), 'false',
          'without evidence it stays Requested (SOP P6)');

-- a disabled client sees nothing
select pg_temp.login('client2');
select is((select count(*)::int from public.portal_account) + (select count(*)::int from public.portal_orders), 0, 'disabled client: no portal data');

select * from finish();
rollback;
