-- Price list sends + base versions (pgTAP, Nov 18 2026): only approved/superseded CLIENT lists are marked as sent; a bd sees
-- the sends of her own accounts only; the author or an admin removes one; base versions show no prices to non-admins.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid()), ('bd', gen_random_uuid()), ('bd2', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@pls.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
update public.profiles set role = 'bd' where user_id in (select id from ids where name in ('bd', 'bd2'));
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
insert into public.accounts (code, name, market) values ('PLS-NL-871', 'PLS A', 'EU');
insert into public.account_assignments (account_id, user_id, role_on_account)
select a.id, i.id, 'owner' from public.accounts a, ids i where a.code = 'PLS-NL-871' and i.name = 'bd';
create temp table l (k text primary key, id uuid);
grant select, insert on l to authenticated;

select pg_temp.login('admin');
with x as (insert into public.price_lists (account_id, note) values (null, 'pls base') returning id) insert into l select 'base', id from x;
insert into public.price_list_rows (price_list_id, model, storage_gb, price_usd) select id, 'iPhone 13', 128, 200 from l where k = 'base';
update public.price_lists set status = 'approved' where id = (select id from l where k = 'base');
with x as (insert into public.price_lists (account_id, base_list_id, note) select a.id, (select id from l where k = 'base'), 'pls client' from public.accounts a where a.code = 'PLS-NL-871' returning id)
insert into l select 'client', id from x;

select pg_temp.login('as');
select throws_ok($$ insert into public.price_list_sends (price_list_id, account_id) select id, gen_random_uuid() from l where k = 'client' $$, '23514', null, 'a draft cannot be marked as sent');
select pg_temp.login('admin');
insert into public.price_list_rows (price_list_id, model, storage_gb, price_usd, floor_usd) select id, 'iPhone 13', 128, 204, 202 from l where k = 'client';
update public.price_lists set status = 'approved' where id = (select id from l where k = 'client');
select throws_ok($$ insert into public.price_list_sends (price_list_id, account_id) select id, gen_random_uuid() from l where k = 'base' $$, '23514', null, 'the base list is never sent to a client');
select pg_temp.login('bd');
select lives_ok($$ insert into public.price_list_sends (price_list_id, account_id, channel) select id, gen_random_uuid(), 'email' from l where k = 'client' $$, 'the owner (bd) marks the approved list as sent');
select is((select account_id from public.price_list_sends limit 1), (select id from public.accounts where code = 'PLS-NL-871'), 'the account comes from the list');
select pg_temp.login('bd2');
select is((select count(*)::int from public.price_list_sends), 0, 'another bd does not see it');
select is((select count(*)::int from public.price_list_base_versions() where id = (select id from l where k = 'base')), 1, 'base versions are listed for staff (no prices)');
select pg_temp.login('as');
delete from public.price_list_sends;
select is((select count(*)::int from public.price_list_sends), 1, 'only the author or an admin removes a send');
select pg_temp.login('bd');
delete from public.price_list_sends;
select is((select count(*)::int from public.price_list_sends), 0, 'the author removes it');
select * from finish();
rollback;
