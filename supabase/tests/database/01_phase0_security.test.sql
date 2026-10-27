-- Phase 0 security tests (pgTAP). Run with: npm run test:db
-- Everything happens inside a transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.security_check()), 0,
  'security_check(): every table has RLS, stamp + audit triggers, no anon grants');

-- ---------------------------------------------------------------------------
-- Test users (one per role + one without role) and two accounts
-- ---------------------------------------------------------------------------
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values
  ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('bd2', gen_random_uuid()),
  ('as', gen_random_uuid()), ('norole', gen_random_uuid());

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       name || '@test.local', '', now(), now()
  from ids;

select is((select count(*)::int from public.profiles where email like '%@test.local'), 5,
  'a profile is created automatically for every new Auth user');
select is((select count(*)::int from public.profiles where email like '%@test.local' and role is null), 5,
  'new profiles start without a role');

update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id in (select id from ids where name in ('bd', 'bd2'));
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');

insert into public.accounts (id, code, name, market) values
  ('11111111-1111-1111-1111-111111111111', 'TSA-NL-801', 'Test account A', 'EU'),
  ('22222222-2222-2222-2222-222222222222', 'TSB-MX-802', 'Test account B', 'LATAM');
insert into public.account_assignments (account_id, user_id, role_on_account)
values ('11111111-1111-1111-1111-111111111111', (select id from ids where name = 'bd'), 'owner');

-- helper to impersonate a user
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

-- ---------------------------------------------------------------------------
-- admin
-- ---------------------------------------------------------------------------
select pg_temp.login('admin');
select ok(public.is_admin(), 'admin: is_admin() = true');
select ok(public.can_see_finance(), 'admin: can_see_finance() = true');
select is((select count(*)::int from public.accounts where code like 'TS_-%-80_'), 2, 'admin: sees all accounts');
select ok((select count(*) from public.settings where confidential) > 0, 'admin: sees confidential settings');
select ok((select count(*) from public.audit_log) > 0, 'admin: reads audit_log');
select lives_ok($$ update public.settings set value = '5' where key = 'thursday_weekday' $$, 'admin: can edit settings');
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- bd (owner of account A only)
-- ---------------------------------------------------------------------------
select pg_temp.login('bd');
select ok(not public.is_admin(), 'bd: is_admin() = false');
select ok(not public.can_see_finance(), 'bd: can_see_finance() = false');
select ok(public.has_account_access('11111111-1111-1111-1111-111111111111'), 'bd: access to own account');
select ok(not public.has_account_access('22222222-2222-2222-2222-222222222222'), 'bd: no access to other account');
select is((select count(*)::int from public.accounts where code like 'TS_-%-80_'), 1, 'bd: sees only own account');
select is((select count(*)::int from public.settings where confidential), 0, 'bd: confidential settings hidden');
select is((select count(*)::int from public.audit_log), 0, 'bd: audit_log hidden');
select ok((select count(*) from public.skus) > 0, 'bd: can read SKUs');
-- RLS silently ignores updates on rows you may not change: check the value did not move.
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'bd');
select is((select role::text from public.profiles where user_id = (select id from ids where name = 'bd')), 'bd',
  'bd: cannot promote themselves to admin');
update public.settings set value = '1' where key = 'thursday_weekday';
select pg_temp.logout();
select is((select value::text from public.settings where key = 'thursday_weekday'), '5', 'bd: cannot edit settings');

-- ---------------------------------------------------------------------------
-- second bd (Arslan case: no accounts)
-- ---------------------------------------------------------------------------
select pg_temp.login('bd2');
select is((select count(*)::int from public.accounts where code like 'TS_-%-80_'), 0, 'bd without accounts: sees no accounts');
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- account_specialist
-- ---------------------------------------------------------------------------
select pg_temp.login('as');
select ok(not public.can_see_finance(), 'account_specialist: can_see_finance() = false');
select is((select count(*)::int from public.accounts where code like 'TS_-%-80_'), 2, 'account_specialist: sees all accounts');
select is((select count(*)::int from public.settings where confidential), 0, 'account_specialist: confidential settings hidden');
select ok((select count(*) from public.settings where not confidential) > 0, 'account_specialist: operational settings visible');
select is((select count(*)::int from public.audit_log), 0, 'account_specialist: audit_log hidden');
select throws_ok($$ insert into public.audit_log (table_name, action) values ('x', 'INSERT') $$, '42501', null,
  'account_specialist: cannot write audit_log');
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- user without a role
-- ---------------------------------------------------------------------------
select pg_temp.login('norole');
select is((select count(*)::int from public.profiles), 1, 'no role: sees only own profile');
select is((select count(*)::int from public.skus), 0, 'no role: sees no SKUs');
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- anonymous and append-only audit
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.skus $$, '42501', null, 'anon: no access to tables');
reset role;
select throws_ok($$ delete from public.audit_log $$, 'P0001', 'audit_log is append-only',
  'audit_log cannot be deleted, even by the database owner');

select * from finish();
rollback;
