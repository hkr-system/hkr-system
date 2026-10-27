-- Notifications triggers and lead funnel (pgTAP).
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@nt.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');

-- new lead from the form → admin + bd, not the specialist
insert into public.leads (company, source) values ('Notify Test Co', 'website_form');
select is((select count(*)::int from public.notifications n join ids on ids.id = n.user_id
            where n.kind = 'new_lead' and n.title = 'New lead: Notify Test Co'), 2, 'new form lead notifies admin and bd');
select is((select count(*)::int from public.notifications n where n.user_id = (select id from ids where name = 'as') and n.kind = 'new_lead'), 0,
  'specialist is not notified of new leads');
-- imported leads do not notify
insert into public.leads (company, source) values ('Imported Quiet Co', 'Leads NL');
select is((select count(*)::int from public.notifications where title = 'New lead: Imported Quiet Co'), 0, 'imports do not notify');

-- inbound WhatsApp: unassigned → every active user, one notification per conversation
select public.wa_ingest($json$
{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{
 "metadata":{"display_phone_number":"15550000000","phone_number_id":"NT-PNID"},
 "contacts":[{"profile":{"name":"Nora"},"wa_id":"50377776666"}],
 "messages":[{"from":"50377776666","id":"wamid.NT1","timestamp":"1761570000","type":"text","text":{"body":"first"}},
             {"from":"50377776666","id":"wamid.NT2","timestamp":"1761570060","type":"text","text":{"body":"second"}}]}}]}]}
$json$::jsonb);
select is((select count(*)::int from public.notifications n join ids on ids.id = n.user_id where n.kind = 'wa_message'), 3,
  'unassigned chat notifies the 3 test users once each (bumped, not duplicated)');
select is((select body from public.notifications n where n.user_id = (select id from ids where name = 'bd') and n.kind = 'wa_message'), 'second',
  'notification shows the latest message');

-- funnel counts a lead that went New → Qualified → Lost as having reached Qualified
insert into public.leads (id, company, source) values ('cccccccc-0000-0000-0000-000000000001', 'Funnel Co', 'manual');
update public.leads set stage = 'Qualified' where id = 'cccccccc-0000-0000-0000-000000000001';
update public.leads set stage = 'Lost', lost_reason = 'test' where id = 'cccccccc-0000-0000-0000-000000000001';
select ok((select reached from public.lead_funnel() where stage = 'Qualified') >= 1, 'funnel: lost lead still counts as reached Qualified');
select ok((select current from public.lead_funnel() where stage = 'Lost') >= 1, 'funnel: lost lead counted in Lost');

select * from finish();
rollback;
