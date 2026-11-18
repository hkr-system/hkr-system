-- Account specialist without Leads / WhatsApp (pgTAP, Nov 18 2026): no leads, chats, numbers or templates; a contact the
-- specialist saves on an account still links the open chat of that phone to the account (trigger contacts_link_chat).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('as', gen_random_uuid()), ('bd', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@scope.local', '', now(), now() from ids;
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
insert into public.accounts (code, name, market) values ('SCO-NL-881', 'SCO A', 'EU');
insert into public.wa_numbers (label, phone_number_id, display_phone, market) values ('SCO-1', 'TEST-PNID-SCO', '+31600000881', 'EU');
insert into public.wa_conversations (wa_number_id, contact_phone) select id, '+31611100881' from public.wa_numbers where label = 'SCO-1';

select pg_temp.login('as');
select is((select count(*)::int from public.wa_numbers where label = 'SCO-1'), 0, 'specialist: no WhatsApp numbers');
select is((select count(*)::int from public.wa_conversations where contact_phone = '+31611100881'), 0, 'specialist: no chats');
select lives_ok($$ insert into public.contacts (account_id, name, phone_e164) select id, 'Scope contact', '+31611100881' from public.accounts where code = 'SCO-NL-881' $$,
  'specialist saves a contact with that phone');
select pg_temp.login('bd');
select is((select count(*)::int from public.wa_conversations where contact_phone = '+31611100881'), 1, 'bd sees the chat');
reset role;
select is((select account_id from public.wa_conversations where contact_phone = '+31611100881'), (select id from public.accounts where code = 'SCO-NL-881'),
  'the chat is linked to the account by the database');
select * from finish();
rollback;
