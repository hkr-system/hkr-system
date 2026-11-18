-- Module access per user (pgTAP, Nov 18 2026): the admin unticks Leads + WhatsApp for one specialist → no leads, chats,
-- numbers or templates for her; another specialist (all modules) still reads leads; a bd without WhatsApp has no broadcasts;
-- only an admin changes the boxes; an admin is never locked out; a contact still links the chat to the account.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid()), ('as2', gen_random_uuid()), ('bd', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@scope.local', '', now(), now() from ids;
update public.profiles set role = 'admin', sections = array['dashboard'] where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist', sections = array['dashboard', 'accounts', 'orders', 'rmas', 'price-lists']
 where user_id = (select id from ids where name = 'as');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as2');
update public.profiles set role = 'bd', sections = array['dashboard', 'accounts', 'leads'] where user_id = (select id from ids where name = 'bd');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
insert into public.accounts (code, name, market) values ('SCO-NL-881', 'SCO A', 'EU');
insert into public.leads (company, email, country, stage) values ('Scope Lead BV', 'scope@lead.test', 'NL', 'New');
insert into public.wa_numbers (label, phone_number_id, display_phone, market) values ('SCO-1', 'TEST-PNID-SCO', '+31600000881', 'EU');
insert into public.wa_conversations (wa_number_id, contact_phone) select id, '+31611100881' from public.wa_numbers where label = 'SCO-1';

select pg_temp.login('as');
select is((select count(*)::int from public.leads where email = 'scope@lead.test'), 0, 'specialist without Leads: no leads');
select is((select count(*)::int from public.wa_conversations where contact_phone = '+31611100881'), 0, 'specialist without WhatsApp: no chats');
select is((select count(*)::int from public.wa_numbers where label = 'SCO-1'), 0, 'specialist without WhatsApp: no numbers');
select lives_ok($$ insert into public.contacts (account_id, name, phone_e164) select id, 'Scope contact', '+31611100881' from public.accounts where code = 'SCO-NL-881' $$,
  'she still saves a contact with that phone');
update public.profiles set sections = null where user_id = (select id from ids where name = 'as');
select pg_temp.login('admin');
select ok((select sections is not null from public.profiles where user_id = (select id from ids where name = 'as')), 'she cannot give herself modules back');
select is((select count(*)::int from public.wa_conversations where contact_phone = '+31611100881'), 1, 'admin sees the chat (an admin is never locked out)');
reset role;
select is((select account_id from public.wa_conversations where contact_phone = '+31611100881'), (select id from public.accounts where code = 'SCO-NL-881'),
  'the chat is linked to the account by the database');

select pg_temp.login('as2');
select is((select count(*)::int from public.leads where email = 'scope@lead.test'), 1, 'specialist with every module still reads leads');
select pg_temp.login('bd');
select ok((select public.has_section('leads')) and not (select public.has_section('whatsapp')) and not (select public.has_section('finance')), 'bd: leads yes, whatsapp no, finance never');
select is((select count(*)::int from public.wa_broadcasts), 0, 'bd without WhatsApp: no broadcasts');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ update public.profiles set sections = array['finance'] where user_id = (select id from ids where name = 'bd') $$, '23514', null,
  'Finance and Settings cannot be given per user');
select * from finish();
rollback;
