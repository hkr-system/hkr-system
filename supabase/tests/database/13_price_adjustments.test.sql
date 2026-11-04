-- Adjustable client prices (pgTAP, Nov 3 2026): admin + specialist adjust a draft row; the specialist never below the floor;
-- the engine price and floor cannot be typed; repricing keeps an adjusted price and moves only the engine price and floor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean with price adjustments');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@adj.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;

insert into public.accounts (code, name, market) values ('ADJ-NL-811', 'ADJ A', 'EU');
create temp table a as select id from public.accounts where code = 'ADJ-NL-811';
grant select on a to authenticated;

select pg_temp.login('admin');
insert into public.price_lists (account_id, note) values (null, 'adj base');
insert into public.price_list_rows (price_list_id, model, storage_gb, price_usd)
select id, 'iPhone 15', 128, 285.00 from public.price_lists where note = 'adj base';
update public.price_lists set status = 'approved' where note = 'adj base';

select pg_temp.login('as');
select public.price_list_create_draft((select id from a), 0.9, 2.0, '{}');
create temp view r as select r.* from public.price_list_rows r join public.price_lists l on l.id = r.price_list_id
  where l.account_id = (select id from a) and l.status = 'draft';
grant select on r to authenticated;

select is((select engine_price_usd || '/' || price_usd || '/' || floor_usd from r), '293.27/293.27/287.57', 'draft: price = engine price');
select lives_ok($$update public.price_list_rows set price_usd = 289.00 where id = (select id from r)$$, 'specialist lowers the price down to the floor');
select ok((select adjusted_at is not null and adjusted_by = (select id from ids where name = 'as') from r), 'the row is stamped as adjusted');
select throws_ok($$update public.price_list_rows set price_usd = 280.00 where id = (select id from r)$$,
  '42501', null, 'specialist cannot go below the floor');
update public.price_list_rows set floor_usd = 1, engine_price_usd = 1 where id = (select id from r);
select is((select engine_price_usd || '/' || floor_usd from r), '293.27/287.57', 'engine price and floor cannot be typed');

select pg_temp.login('admin');
select lives_ok($$update public.price_list_rows set price_usd = 280.00 where id = (select id from r)$$, 'admin can go below the floor (SOP 5.5)');
select public.price_list_set_percentages((select id from public.price_lists where account_id = (select id from a) and status = 'draft'), 1.0, 2.0, null);
select is((select engine_price_usd || '/' || price_usd || '/' || floor_usd from r), '293.55/280.00/287.85', 'repricing keeps the adjusted price, moves engine and floor');
update public.price_list_rows set price_usd = 293.55 where id = (select id from r);
select ok((select adjusted_at is null from r), 'back to the engine price = not adjusted');

select * from finish();
rollback;
