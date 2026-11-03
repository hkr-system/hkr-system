-- Phase 5 (pgTAP, Nov 3 2026): client updates and escalations follow account access; only an admin answers and
-- closes an escalation; the author can correct the facts while it is open; new rows always start open.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid()), ('bd', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@p5.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.system() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into public.accounts (code, name, market) values ('PFV-NL-701', 'Phase five', 'EU');
create temp table acc as select id from public.accounts where code = 'PFV-NL-701';
grant select on acc to authenticated;

-- client updates
select pg_temp.login('as');
select lives_ok($$insert into public.client_updates (account_id, kind, week_start, message) select id, 'thursday', '2031-03-03', 'x' from acc$$,
  'specialist logs a Thursday update');
select pg_temp.login('bd');
select is((select count(*)::int from public.client_updates where account_id = (select id from acc)), 0, 'bd does not see updates of accounts she does not own');
select throws_ok($$insert into public.client_updates (account_id, kind, week_start) select id, 'rma_ask', '2031-03-03' from acc$$,
  '42501', null, 'bd cannot log an update for an account she does not own');
select throws_ok($$insert into public.client_updates (account_id, kind, week_start) select id, 'weekly', '2031-03-03' from acc$$,
  null, null, 'unknown kinds are refused');

-- escalations
select pg_temp.login('as');
select lives_ok($$insert into public.escalations (account_id, topic, what_happened, status, decision)
                  select id, 'discount', 'Client asks 2 %', 'closed', 'self-approved' from acc$$, 'specialist prepares a question for the SD');
select is((select status || '/' || coalesce(decision, '-') from public.escalations where account_id = (select id from acc)), 'open/-',
  'new escalations always start open, without a decision');
select lives_ok($$update public.escalations set proposal = 'Hold the list price' where account_id = (select id from acc)$$, 'the author corrects the facts');
select throws_ok($$update public.escalations set status = 'closed' where account_id = (select id from acc)$$, '42501', null,
  'only an admin closes');
select throws_ok($$update public.escalations set decision = 'ok' where account_id = (select id from acc)$$, '42501', null,
  'only an admin writes the decision');

select pg_temp.login('admin');
select lives_ok($$update public.escalations set decision = 'No discount', status = 'closed' where account_id = (select id from acc)$$, 'admin answers and closes');
select is((select decided_by from public.escalations where account_id = (select id from acc)), (select id from ids where name = 'admin'),
  'decided_by is the admin');

select pg_temp.system();
select is((select count(*)::int from public.security_check()), 0, 'security_check is clean');

select * from finish();
rollback;
