-- Phase 1 lead security and behaviour tests (pgTAP). Run with: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select is((select count(*)::int from public.security_check()), 0, 'security_check() still clean after Phase 1');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@lt.local', '', now(), now()
  from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');
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

-- bd creates and works a lead
select pg_temp.login('bd');
select lives_ok($$ insert into public.leads (id, company, email, source) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Test Phones BV', 'buyer@testphones.example', 'manual') $$,
  'bd: can create a lead');
select is((select count(*)::int from public.lead_events where lead_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'created'), 1,
  'creating a lead writes a "created" timeline event');
select lives_ok($$ update public.leads set stage = 'Contacted' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'bd: can change stage');
select is((select count(*)::int from public.lead_events where lead_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'stage_change'), 1,
  'stage change writes a timeline event');
select throws_ok($$ update public.leads set stage = 'Lost' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'Lost without a reason is refused');
select lives_ok($$ update public.leads set stage = 'Lost', lost_reason = 'Only buys new' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'Lost with a reason is accepted');
select throws_ok($$ insert into public.leads (company, email) values ('Dup', 'buyer@testphones.example') $$,
  '23505', null, 'a second lead with the same email is refused');
select lives_ok($$ insert into public.lead_events (lead_id, kind, body) values ('aaaaaaaa-0000-0000-0000-000000000001', 'note', 'Called, no answer') $$,
  'bd: can add a note');
select throws_ok($$ insert into public.lead_events (lead_id, kind, body) values ('aaaaaaaa-0000-0000-0000-000000000001', 'stage_change', 'fake') $$,
  '42501', null, 'bd: cannot forge a stage-change event');
-- RLS silently skips rows without a delete policy: the lead must survive.
delete from public.leads where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select ok(true, 'bd: delete attempted');
select pg_temp.logout();
select is((select count(*)::int from public.leads where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'lead still exists after bd delete attempt');

-- account specialist: read only
select pg_temp.login('as');
select is((select count(*)::int from public.leads where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'account_specialist: can read leads');
select throws_ok($$ insert into public.leads (company) values ('AS lead') $$, '42501', null, 'account_specialist: cannot create leads');
update public.leads set company = 'Changed by AS' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select count(*)::int from public.lead_form_submissions), 0, 'account_specialist: form submissions hidden');
select pg_temp.logout();
select is((select company from public.leads where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Test Phones BV',
  'account_specialist: cannot edit leads');

-- anonymous
set local role anon;
select throws_ok($$ select * from public.leads $$, '42501', null, 'anon: no access to leads');
reset role;

-- undo import removes untouched leads only
insert into public.lead_import_batches (id, source) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Test list');
insert into public.leads (company, email, source, import_batch_id) values
  ('Imported 1', 'i1@imp.example', 'Test list', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('Imported 2', 'i2@imp.example', 'Test list', 'bbbbbbbb-0000-0000-0000-000000000001');
update public.leads set stage = 'Contacted' where email = 'i2@imp.example';
select pg_temp.login('bd');
select results_eq($$ select removed, kept from public.undo_lead_import('bbbbbbbb-0000-0000-0000-000000000001') $$,
  $$ values (1, 1) $$, 'undo import removes untouched leads and keeps worked ones');
select pg_temp.logout();

select * from finish();
rollback;
