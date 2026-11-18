-- Door-to-door set-up (pgTAP, Nov 18 2026): only an admin sets intermediaries.d2d (the specialist edits the rest of the
-- company); a send records USD or door to door with company and rate.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@d2d.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
insert into public.intermediaries (name) values ('D2D Test Co');

select pg_temp.login('as');
select throws_ok($$ update public.intermediaries set d2d = '{"enabled": true}' where name = 'D2D Test Co' $$, '42501', null, 'specialist cannot set door-to-door fees');
select lives_ok($$ update public.intermediaries set vat = 'NL9' where name = 'D2D Test Co' $$, 'specialist still edits the company');
select pg_temp.login('admin');
select lives_ok($$ update public.intermediaries set d2d = '{"enabled": true, "fixed_eur": 1}' where name = 'D2D Test Co' $$, 'admin sets them');
select pg_temp.login('as');
select lives_ok($$ update public.intermediaries set vat = 'NL10' where name = 'D2D Test Co' $$, 'specialist edits the company without touching the fees');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ insert into public.price_list_sends (price_list_id, account_id, variant) select id, account_id, 'eur' from public.price_lists where account_id is not null limit 1 $$,
  '23514', null, 'a send is usd or d2d only');
select * from finish();
rollback;
