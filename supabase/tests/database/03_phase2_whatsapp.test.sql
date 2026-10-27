-- Phase 2 WhatsApp tests (pgTAP). Run with: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean after Phase 2');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('bd2', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@wa.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id in (select id from ids where name in ('bd', 'bd2'));
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

-- 1. Inbound message from an unknown number
create temp table p as select $json$
{"object":"whatsapp_business_account","entry":[{"id":"WABA","changes":[{"field":"messages","value":{
 "messaging_product":"whatsapp",
 "metadata":{"display_phone_number":"15551442195","phone_number_id":"TEST-PNID-1"},
 "contacts":[{"profile":{"name":"Rita Buyer"},"wa_id":"5037000111"}],
 "messages":[{"from":"5037000111","id":"wamid.IN1","timestamp":"1761570000","type":"text","text":{"body":"Hola, quiero la lista de precios"}}]}}]}]}
$json$::jsonb as j;

select is((public.wa_ingest((select j from p)) ->> 'messages')::int, 1, 'ingest: one new message');
select is((select count(*)::int from public.wa_numbers where phone_number_id = 'TEST-PNID-1'), 1, 'ingest: receiving number created');
select is((select source from public.leads where phone_e164 = '+5037000111'), 'whatsapp_inbound', 'unknown number becomes a lead (source whatsapp_inbound)');
select is((select company from public.leads where phone_e164 = '+5037000111'), 'Rita Buyer', 'lead named after the WhatsApp profile');
select ok((select last_inbound_at is not null from public.wa_conversations where contact_phone = '+5037000111'), 'conversation has last_inbound_at');
select is((public.wa_ingest((select j from p)) ->> 'messages')::int, 0, 'same webhook twice is ignored (idempotent)');
select is((select count(*)::int from public.wa_messages where meta_message_id = 'wamid.IN1'), 1, 'message stored once');
select ok(exists (select 1 from public.lead_events e join public.leads l on l.id = e.lead_id
                  where l.phone_e164 = '+5037000111' and e.kind = 'whatsapp'), 'inbound message on the lead timeline');

-- 2. Outbound message + statuses never go backwards
insert into public.wa_messages (conversation_id, direction, type, body, meta_message_id, status, cost_category)
select id, 'outbound', 'text', 'Hola Rita', 'wamid.OUT1', 'sent', 'service' from public.wa_conversations where contact_phone = '+5037000111';
select public.wa_ingest($json$
{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{
 "metadata":{"phone_number_id":"TEST-PNID-1","display_phone_number":"15551442195"},
 "statuses":[{"id":"wamid.OUT1","status":"read","timestamp":"1761570100"},
             {"id":"wamid.OUT1","status":"delivered","timestamp":"1761570050"}]}}]}]}
$json$::jsonb);
select is((select status::text from public.wa_messages where meta_message_id = 'wamid.OUT1'), 'read', 'status read is not overwritten by a late delivered');
select ok((select delivered_at is not null and read_at is not null from public.wa_messages where meta_message_id = 'wamid.OUT1'), 'delivered and read times stored');

-- 3. Opt-out
update public.leads set whatsapp_opt_in = true where phone_e164 = '+5037000111';
select public.wa_ingest($json$
{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{
 "metadata":{"phone_number_id":"TEST-PNID-1","display_phone_number":"15551442195"},
 "messages":[{"from":"5037000111","id":"wamid.IN2","timestamp":"1761570200","type":"button",
              "button":{"text":"Stop promotions","payload":"STOP"}}]}}]}]}
$json$::jsonb);
select is((select whatsapp_opt_in from public.leads where phone_e164 = '+5037000111'), false, '"Stop promotions" button sets whatsapp_opt_in = false');

-- 4. Visibility
insert into public.wa_conversations (wa_number_id, contact_phone, assigned_user_id)
select id, '+31600000001', (select id from ids where name = 'bd2') from public.wa_numbers where phone_number_id = 'TEST-PNID-1';

insert into public.wa_templates (name, language, category, status) values ('test_tpl', 'en', 'MARKETING', 'APPROVED');

select pg_temp.login('bd');
select is((select count(*)::int from public.wa_conversations where contact_phone = '+5037000111'), 1, 'bd sees unassigned conversation');
select is((select count(*)::int from public.wa_conversations where contact_phone = '+31600000001'), 0, 'bd does not see a conversation assigned to another bd');
select throws_ok($$ insert into public.wa_messages (conversation_id, direction, type, body, status)
  select id, 'inbound', 'text', 'fake', 'received' from public.wa_conversations where contact_phone = '+5037000111' $$,
  '42501', null, 'users cannot insert fake inbound messages');
select lives_ok($$ insert into public.wa_broadcasts (name, wa_number_id, template_id)
  select 'Test', n.id, t.id from public.wa_numbers n, (select id from public.wa_templates limit 1) t where n.phone_number_id = 'TEST-PNID-1' $$,
  'bd can create a broadcast draft');
select throws_ok($$ update public.wa_broadcasts set status = 'approved' $$, 'P0001', null, 'bd cannot approve a broadcast');
select pg_temp.logout();

select pg_temp.login('as');
select is((select count(*)::int from public.wa_conversations where contact_phone = '+5037000111'), 1, 'specialist sees unassigned conversation');
select is((select count(*)::int from public.wa_broadcasts), 0, 'specialist cannot see broadcasts');
select pg_temp.logout();

select pg_temp.login('admin');
select is((select count(*)::int from public.wa_conversations where contact_phone in ('+5037000111', '+31600000001')), 2, 'admin sees all conversations');
select pg_temp.logout();

-- 5. Notifications are private
insert into public.notifications (user_id, kind, title) values ((select id from ids where name = 'bd2'), 'test', 'For bd2');
select pg_temp.login('bd');
select is((select count(*)::int from public.notifications where title = 'For bd2'), 0, 'notifications of others are hidden');
select pg_temp.logout();

set local role anon;
select throws_ok($$ select * from public.wa_messages $$, '42501', null, 'anon: no access to messages');
reset role;

select * from finish();
rollback;
