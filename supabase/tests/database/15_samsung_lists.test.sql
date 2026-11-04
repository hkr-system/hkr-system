-- Samsung price lists (pgTAP, Nov 4 2026): an iPhone base and a Samsung base are approved side by side; a client gets one list
-- per brand (same engine, rules and adjustments); approving a Samsung list never supersedes the iPhone list; Samsung order lines
-- refuse battery options and CE marks.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean with brands');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@sam.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;

insert into public.accounts (code, name, market) values ('SAM-GT-831', 'SAM A', 'LATAM');
create temp table a as select id from public.accounts where code = 'SAM-GT-831';
grant select on a to authenticated;

select pg_temp.login('admin');
-- the tests own the bases: earlier demo bases are superseded by these
insert into public.price_lists (account_id, brand, note) values (null, 'iphone', 'sam ip base'), (null, 'samsung', 'sam base');
insert into public.price_list_rows (price_list_id, model, storage_gb, note, price_usd)
select id, 'iPhone 14', 128, null, 300.00 from public.price_lists where note = 'sam ip base';
insert into public.price_list_rows (price_list_id, model, storage_gb, note, price_usd)
select id, m, g, n, p from public.price_lists, (values ('S24', 128, 'S921U', 400.00), ('S24 Ultra', 256, 'S928U', 600.00)) v(m, g, n, p)
 where note = 'sam base';
update public.price_lists set status = 'approved' where note in ('sam ip base', 'sam base');
select is((select count(*)::int from public.price_lists where account_id is null and status = 'approved'), 2,
  'an iPhone base and a Samsung base are approved together');

select pg_temp.login('as');
select public.price_list_create_draft((select id from a), 1.0, 1.0, '{}');
select public.price_list_create_draft((select id from a), 1.0, 1.0, '{}', current_date, 'samsung');
select is((select count(*)::int from public.price_lists where account_id = (select id from a) and status = 'draft'), 2,
  'one draft per brand: preparing Samsung keeps the iPhone draft');
create temp view s as select r.* from public.price_list_rows r join public.price_lists l on l.id = r.price_list_id
  where l.account_id = (select id from a) and l.brand = 'samsung' and l.status = 'draft';
grant select on s to authenticated;
select is((select string_agg(model || ' ' || price_usd, ', ' order by model) from s), 'S24 408.00, S24 Ultra 612.00',
  'the Samsung list = Samsung base × (1 + RMA_c + Extra_c)');
select is((select version from public.price_lists where account_id = (select id from a) and brand = 'samsung'), 1, 'Samsung list starts at v1');

-- typed price and client rule work on Samsung rows too
update public.price_list_rows set price_usd = 620.00 where id = (select id from s where model = 'S24 Ultra');
select ok((select adjusted_at is not null from s where model = 'S24 Ultra'), 'a typed Samsung price is marked adjusted');
select is((select public.price_rule_remember((select id from s where model = 'S24 Ultra'))), 20.00::numeric, 'remember on Samsung: 620 − 600 = rule +$20');

select pg_temp.login('admin');
update public.price_lists set status = 'approved' where account_id = (select id from a) and status = 'draft';
select is((select string_agg(brand::text, ',' order by brand) from public.price_lists where account_id = (select id from a) and status = 'approved'),
  'iphone,samsung', 'the client has an approved iPhone list and an approved Samsung list');

-- orders: Samsung lines take no battery option and no CE
insert into public.orders (account_id, order_date) values ((select id from a), current_date);
create temp table o as select id from public.orders where account_id = (select id from a);
grant select on o to authenticated;
select throws_ok($$insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed, ce_marked, battery_option)
  values ((select id from o), 'S24 Ultra', 256, 10, 620, true, true, null)$$, '23514', null, 'CE marks refused on a Samsung line');
select throws_ok($$insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed, battery_option, battery_new)
  values ((select id from o), 'S24', 128, 10, 408, true, 'boosted100', false)$$, '23514', null, 'battery option refused on a Samsung line');
select lives_ok($$insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed, battery_option)
  values ((select id from o), 'S24', 128, 10, 408, true, null)$$, 'a plain Samsung line is fine');

select * from finish();
rollback;
