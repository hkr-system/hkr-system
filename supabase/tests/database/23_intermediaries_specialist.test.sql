-- Intermediaries & clearance companies (pgTAP, Nov 18 2026): admin + account specialist add and edit; bd cannot; only admin removes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('as', gen_random_uuid()), ('bd', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@im.local', '', now(), now() from ids;
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
select pg_temp.login('as');
select lives_ok($$ insert into public.intermediaries (name, kind, vat) values ('IM Test Clearance', 'clearance', 'NL1') $$, 'specialist adds a clearance company');
select lives_ok($$ update public.intermediaries set vat = 'NL2' where name = 'IM Test Clearance' $$, 'specialist edits it');
delete from public.intermediaries where name = 'IM Test Clearance';
select is((select count(*)::int from public.intermediaries where name = 'IM Test Clearance'), 1, 'specialist cannot remove it');
select pg_temp.login('bd');
select throws_ok($$ insert into public.intermediaries (name) values ('IM Test BD') $$, '42501', null, 'bd cannot add one');
select * from finish();
rollback;
