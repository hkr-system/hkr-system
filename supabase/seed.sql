-- =============================================================================
-- HKR System — demo seed (Phase 0)
-- Safe to run more than once. Run it AFTER the four demo users exist in
-- Supabase → Authentication → Users (see README "First-time setup").
-- Contains demo data only — no real client data, no passwords.
-- =============================================================================

-- 1. Roles for the demo users (matched by email)
update public.profiles p
   set role = v.role::public.app_role,
       full_name = v.full_name,
       timezone = v.timezone
  from (values
    ('gabriel.demo@hk-refurbished-stock.com', 'admin',              'Gabriel (demo)', 'America/El_Salvador'),
    ('yessica.demo@hk-refurbished-stock.com', 'bd',                 'Yessica (demo)', 'America/El_Salvador'),
    ('arslan.demo@hk-refurbished-stock.com',  'bd',                 'Arslan (demo)',  'Asia/Hong_Kong'),
    ('atreyi.demo@hk-refurbished-stock.com',  'account_specialist', 'Atreyi (demo)',  'Asia/Hong_Kong')
  ) as v(email, role, full_name, timezone)
 where p.email = v.email;

-- Warn (does not fail) if a demo user has not been created yet.
do $$
declare missing text;
begin
  select string_agg(e, ', ') into missing
    from unnest(array[
      'gabriel.demo@hk-refurbished-stock.com',
      'yessica.demo@hk-refurbished-stock.com',
      'arslan.demo@hk-refurbished-stock.com',
      'atreyi.demo@hk-refurbished-stock.com']) as e
   where not exists (select 1 from public.profiles p where p.email = e);
  if missing is not null then
    raise warning 'These demo users do not exist yet (create them in Authentication → Users, then run this file again): %', missing;
  end if;
end $$;

-- 2. Intermediaries (EU invoicing chain, brief §6). Cutoff = Friday.
insert into public.intermediaries (name, default_cutoff_weekday)
values ('Global Connect', 5),
       ('ASR', 5)
on conflict (name) do nothing;

-- 3. Five demo SKUs. iPhone 16 series never carries the battery line.
insert into public.skus (model, storage_gb, color, grade, battery_eligible)
values ('iPhone 13',          128, 'Midnight',        'A+++', true),
       ('iPhone 14 Pro',      256, 'Deep Purple',     'A+++', true),
       ('iPhone 15',          128, 'Black',           'A+++', true),
       ('iPhone 16',          128, 'Black',           'A+++', false),
       ('iPhone 16 Pro Max',  256, 'Desert Titanium', 'A+++', false)
on conflict (model, storage_gb, color, grade) do nothing;

-- 4. Thirty demo leads across stages, tiers and markets (Phase 1). Emails use the
--    reserved example.com domain, so they are never sent to Brevo. Scores follow the
--    default scoring rules with an empty target-country list (max 60 → no Tier A yet).
insert into public.leads (company, contact_name, country, city, market, source, email, phone_e164, business_type,
  sells_iphones, sells_refurbished, volume_range, volume_units_month, score, tier, disqualified, disqualify_reason,
  stage, owner_user_id, next_action, next_action_date, lost_reason, language)
values
  ('Amstel Mobile BV', 'Daan de Vries', 'NL', 'Amsterdam', 'EU', 'Leads NL', 'demo01@example.com', '+31611000000', 'refurbished_reseller', true, true, '400-999', 400, 60, 'B', false, null, 'Qualified', (select user_id from public.profiles where email = 'yessica.demo@hk-refurbished-stock.com'), 'Call to confirm volumes', current_date + 0, null, 'en'),
  ('Rotterdam Phone Hub', 'Sanne Bakker', 'NL', 'Rotterdam', 'EU', 'Leads NL', 'demo02@example.com', '+31611007919', 'phone_shop', true, true, '100-399', 100, 45, 'B', false, null, 'Contacted', (select user_id from public.profiles where email = 'yessica.demo@hk-refurbished-stock.com'), 'Chase reply', current_date + -2, null, 'en'),
  ('Utrecht Refurb Store', 'Lars Visser', 'NL', 'Utrecht', 'EU', 'Leads NL', 'demo03@example.com', '+31611015838', 'online_seller', true, true, '100-399', 100, 45, 'B', false, null, 'New', null, null, null, null, 'en'),
  ('Berlin Second Life GmbH', 'Jonas Weber', 'DE', 'Berlin', 'EU', 'LinkedIn EU', 'demo04@example.com', '+491511023757', 'refurbished_reseller', true, true, '1000+', 1000, 60, 'B', false, null, 'Meeting', (select user_id from public.profiles where email = 'gabriel.demo@hk-refurbished-stock.com'), 'Send price list on WhatsApp', current_date + 1, null, 'en'),
  ('Hamburg Handy Markt', 'Lea Schmidt', 'DE', 'Hamburg', 'EU', 'LinkedIn EU', 'demo05@example.com', '+491511031676', 'phone_shop', true, false, 'lt100', 0, 25, 'C', false, null, 'Replied', (select user_id from public.profiles where email = 'arslan.demo@hk-refurbished-stock.com'), null, null, null, 'en'),
  ('München ReCell', 'Felix Wagner', 'DE', 'Munich', 'EU', 'LinkedIn EU', 'demo06@example.com', '+491511039595', 'distributor', true, true, '400-999', 400, 60, 'B', false, null, 'Sample/Proposal', (select user_id from public.profiles where email = 'gabriel.demo@hk-refurbished-stock.com'), 'Check sample arrived', current_date + 3, null, 'en'),
  ('Madrid Móviles Renovados', 'Lucía García', 'ES', 'Madrid', 'EU', 'IFA master list', 'demo07@example.com', '+34611047514', 'refurbished_reseller', true, true, '100-399', 100, 45, 'B', false, null, 'Contacted', (select user_id from public.profiles where email = 'arslan.demo@hk-refurbished-stock.com'), 'Call to confirm volumes', current_date + 0, null, 'es'),
  ('Barcelona Smart Outlet', 'Pau Puig', 'ES', 'Barcelona', 'EU', 'IFA master list', 'demo08@example.com', '+34611055433', 'online_seller', true, true, '400-999', 400, 60, 'B', false, null, 'Replied', null, null, null, null, 'es'),
  ('Milano Telefonia Srl', 'Giulia Rossi', 'IT', 'Milan', 'EU', 'IFA master list', 'demo09@example.com', '+393311063352', 'phone_shop', true, true, '100-399', 100, 45, 'B', false, null, 'New', (select user_id from public.profiles where email = 'arslan.demo@hk-refurbished-stock.com'), 'Send intro email', current_date + 5, null, 'en'),
  ('Roma Ricondizionati', 'Marco Bianchi', 'IT', 'Rome', 'EU', 'IFA master list', 'demo10@example.com', '+393311071271', 'pawn_shop', true, false, 'lt100', 0, 25, 'C', true, 'Excluded business type', 'New', null, null, null, null, 'en'),
  ('Paris Reconditionné SAS', 'Camille Martin', 'FR', 'Paris', 'EU', 'LinkedIn EU', 'demo11@example.com', '+33611079190', 'refurbished_reseller', true, true, '1000+', 1000, 60, 'B', false, null, 'Won', (select user_id from public.profiles where email = 'gabriel.demo@hk-refurbished-stock.com'), null, null, null, 'en'),
  ('Lyon Mobile Express', 'Hugo Bernard', 'FR', 'Lyon', 'EU', 'LinkedIn EU', 'demo12@example.com', '+33611087109', 'large_chain', true, false, '1000+', 1000, 50, 'B', true, 'Excluded business type', 'Lost', (select user_id from public.profiles where email = 'yessica.demo@hk-refurbished-stock.com'), null, null, 'Only buys new devices', 'en'),
  ('Bruxelles GSM', 'Emma Peeters', 'BE', 'Brussels', 'EU', 'website_form', 'demo13@example.com', '+32471109502', 'phone_shop', true, true, '100-399', 100, 45, 'B', false, null, 'Qualified', (select user_id from public.profiles where email = 'yessica.demo@hk-refurbished-stock.com'), 'Send updated price list', current_date + -1, null, 'en'),
  ('Warszawa Telefony', 'Piotr Nowak', 'PL', 'Warsaw', 'EU', 'LinkedIn EU', 'demo14@example.com', '+485011102947', 'distributor', true, true, '400-999', 400, 60, 'B', false, null, 'Contacted', (select user_id from public.profiles where email = 'arslan.demo@hk-refurbished-stock.com'), 'Follow up on the quote', current_date + 2, null, 'en'),
  ('Lisboa Smartphones', 'Inês Silva', 'PT', 'Lisbon', 'EU', 'website_form', 'demo15@example.com', '+351911110866', 'online_seller', false, true, 'lt100', 0, 10, 'C', false, null, 'New', null, null, null, null, 'en'),
  ('CDMX Celulares', 'Alejandro Hernández', 'MX', 'Mexico City', 'LATAM', 'whatsapp_inbound', 'demo16@example.com', '+525511187850', 'distributor', true, true, '1000+', 1000, 60, 'B', false, null, 'Meeting', (select user_id from public.profiles where email = 'gabriel.demo@hk-refurbished-stock.com'), 'Call to confirm volumes', current_date + 0, null, 'es'),
  ('Guadalajara iStore', 'Fernanda López', 'MX', 'Guadalajara', 'LATAM', 'website_form', 'demo17@example.com', '+525511267040', 'refurbished_reseller', true, true, '400-999', 400, 60, 'B', false, null, 'Qualified', (select user_id from public.profiles where email = 'arslan.demo@hk-refurbished-stock.com'), 'Book a call', current_date + -3, null, 'es'),
  ('Bogotá Tecnología SAS', 'Santiago Gómez', 'CO', 'Bogotá', 'LATAM', 'IFA master list', 'demo18@example.com', '+573101134623', 'phone_shop', true, true, '100-399', 100, 45, 'B', false, null, 'Contacted', (select user_id from public.profiles where email = 'arslan.demo@hk-refurbished-stock.com'), 'Send price list on WhatsApp', current_date + 1, null, 'es'),
  ('Lima Phones', 'Valeria Torres', 'PE', 'Lima', 'LATAM', 'website_form', 'demo19@example.com', '+51987114254', 'online_seller', true, false, '100-399', 100, 35, 'C', false, null, 'New', null, null, null, null, 'es'),
  ('Santiago Reacondicionados', 'Matías Muñoz', 'CL', 'Santiago', 'LATAM', 'IFA master list', 'demo20@example.com', '+569611150461', 'refurbished_reseller', true, true, '400-999', 400, 60, 'B', false, null, 'Replied', (select user_id from public.profiles where email = 'arslan.demo@hk-refurbished-stock.com'), null, null, null, 'es'),
  ('San Salvador Móvil', 'Diego Martínez', 'SV', 'San Salvador', 'LATAM', 'referral', 'demo21@example.com', '+50371158380', 'phone_shop', true, true, 'lt100', 0, 35, 'C', false, null, 'Contacted', (select user_id from public.profiles where email = 'gabriel.demo@hk-refurbished-stock.com'), 'Call to confirm volumes', current_date + 0, null, 'es'),
  ('Guatemala Cell Center', 'Andrea Castillo', 'GT', 'Guatemala City', 'LATAM', 'website_form', 'demo22@example.com', '+50251166299', 'dropshipping', true, false, '100-399', 100, 35, 'C', true, 'Excluded business type', 'New', null, null, null, null, 'es'),
  ('Panamá Smart', 'Carlos Rodríguez', 'PA', 'Panama City', 'LATAM', 'referral', 'demo23@example.com', '+50761174218', 'distributor', true, true, '1000+', 1000, 60, 'B', false, null, 'Sample/Proposal', (select user_id from public.profiles where email = 'gabriel.demo@hk-refurbished-stock.com'), 'Send updated price list', current_date + -1, null, 'es'),
  ('Miami Wireless Wholesale', 'Jessica Brown', 'US', 'Miami', 'US', 'LinkedIn EU', 'demo24@example.com', '+13051182137', 'distributor', true, true, '1000+', 1000, 60, 'B', false, null, 'Qualified', (select user_id from public.profiles where email = 'gabriel.demo@hk-refurbished-stock.com'), 'Follow up on the quote', current_date + 2, null, 'en'),
  ('Houston Phone Depot', 'Michael Johnson', 'US', 'Houston', 'US', 'website_form', 'demo25@example.com', '+13051190056', 'refurbished_reseller', true, true, '400-999', 400, 60, 'B', false, null, 'Contacted', (select user_id from public.profiles where email = 'yessica.demo@hk-refurbished-stock.com'), 'Call to confirm volumes', current_date + 0, null, 'en'),
  ('NYC Unlocked', 'Ashley Davis', 'US', 'New York', 'US', 'website_form', 'demo26@example.com', '+13051197975', 'online_seller', true, true, '100-399', 100, 45, 'B', false, null, 'New', null, null, null, null, 'en'),
  ('LA Repair & Sell', 'Chris Miller', 'US', 'Los Angeles', 'US', 'website_form', 'demo27@example.com', '+13051205894', 'repair_only', true, false, 'lt100', 0, 25, 'C', true, 'Excluded business type', 'Lost', (select user_id from public.profiles where email = 'yessica.demo@hk-refurbished-stock.com'), null, null, 'Repair only, not a reseller', 'en'),
  ('Dubai Mobile Trading LLC', 'Omar Al Mansoori', 'AE', 'Dubai', 'ROW', 'LinkedIn EU', 'demo28@example.com', '+971501213813', 'distributor', true, true, '1000+', 1000, 60, 'B', false, null, 'Meeting', (select user_id from public.profiles where email = 'gabriel.demo@hk-refurbished-stock.com'), 'Video call with buyer', current_date + 4, null, 'en'),
  ('Riyadh Smart Devices', 'Faisal Al Saud', 'SA', 'Riyadh', 'ROW', 'IFA master list', 'demo29@example.com', '+966501221732', 'phone_shop', true, true, '400-999', 400, 60, 'B', false, null, 'New', (select user_id from public.profiles where email = 'yessica.demo@hk-refurbished-stock.com'), 'Ask for monthly forecast', current_date + 7, null, 'en'),
  ('Lagos Phone Mart', 'Chinedu Okafor', 'NG', 'Lagos', 'ROW', 'website_form', 'demo30@example.com', '+2348031229650', 'online_seller', true, true, '100-399', 100, 45, 'B', false, null, 'Replied', null, null, null, null, 'en')
on conflict (email) where email is not null do nothing;

-- 5. WhatsApp demo data (Phase 2). Demo numbers are NOT connected to Meta (is_demo = true):
--    replies from them are disabled. The real numbers appear when Meta sends their first webhook.
insert into public.wa_numbers (phone_number_id, display_phone, label, market, is_demo, quality_rating, messaging_tier)
values ('demo-hk1', '+85200000001', 'HK-1 (demo)', 'ROW', true, 'GREEN', 'TIER_1K'),
       ('demo-hk2', '+85200000002', 'HK-2 (demo)', 'ROW', true, 'GREEN', 'TIER_250'),
       ('demo-us',  '+13050000003', 'US (demo)',   'US',  true, 'GREEN', 'TIER_1K'),
       ('demo-nl',  '+31600000004', 'NL (demo)',   'EU',  true, 'YELLOW', 'TIER_250')
on conflict (phone_number_id) do nothing;

-- hello_world exists in every Meta WhatsApp test account; "Sync from Meta" refreshes it.
insert into public.wa_templates (name, language, category, status, components)
values ('hello_world', 'en_US', 'UTILITY', 'APPROVED',
        '[{"type":"HEADER","format":"TEXT","text":"Hello World"},{"type":"BODY","text":"Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us."},{"type":"FOOTER","text":"WhatsApp Business Platform sample message"}]')
on conflict (name, language) do nothing;

do $$
declare
  v_conv uuid;
  v_gabriel uuid := (select user_id from public.profiles where email = 'gabriel.demo@hk-refurbished-stock.com');
  r record;
begin
  if exists (select 1 from public.wa_conversations c join public.wa_numbers n on n.id = c.wa_number_id where n.is_demo) then
    return; -- already seeded
  end if;
  for r in
    select * from (values
      ('demo-us', '+525511187850', 'Alejandro', null::uuid, 'open',     array['in|180|Hola, ¿tienen iPhone 13 de 128GB para esta semana?', 'out|170|Hola Alejandro, sí. Le comparto la lista hoy.', 'in|30|Perfecto, gracias']),
      ('demo-nl', '+31611000000',  'Daan',      null,       'open',     array['in|1500|Can you send me the price list for iPhone 14 Pro?', 'out|1490|Hi Daan, sure — sending it today.', 'in|20|Also interested in 15 Pro Max']),
      ('demo-nl', '+491511023757', 'Jonas',     v_gabriel,  'open',     array['out|3000|Hi Jonas, here is our latest list.', 'in|2900|Thanks, we will review on Monday']),
      ('demo-nl', '+34611055433',  'Pau',       null,       'resolved', array['in|5000|Do you ship to Barcelona?', 'out|4990|Yes, FOB Hong Kong; we can book the courier.']),
      ('demo-hk1','+2348031229650','Chinedu',   null,       'open',     array['in|45|Hello, what is your minimum order?'])
    ) as t(number_pid, phone, name, assignee, status, msgs)
  loop
    insert into public.wa_conversations (wa_number_id, contact_phone, contact_name, lead_id, assigned_user_id, status)
    values ((select id from public.wa_numbers where phone_number_id = r.number_pid), r.phone, r.name,
            (select id from public.leads where phone_e164 = r.phone), r.assignee, 'open')
    returning id into v_conv;
    insert into public.wa_messages (conversation_id, direction, type, body, status, cost_category, meta_timestamp)
    select v_conv,
           case when split_part(m, '|', 1) = 'in' then 'inbound' else 'outbound' end::public.wa_direction,
           'text', split_part(m, '|', 3),
           case when split_part(m, '|', 1) = 'in' then 'received' else 'read' end::public.wa_message_status,
           case when split_part(m, '|', 1) = 'in' then 'none' else 'service' end::public.wa_cost_category,
           now() - (split_part(m, '|', 2)::int * interval '1 minute')
      from unnest(r.msgs) with ordinality as x(m, ord)
     order by ord;
    update public.wa_conversations set status = r.status::public.wa_conversation_status where id = v_conv;
  end loop;
end $$;

-- Some demo leads agreed to WhatsApp messages (for broadcast tests). The US one shows the
-- automatic skip of marketing templates to +1 numbers.
update public.leads set whatsapp_opt_in = true
 where email in ('demo01@example.com', 'demo04@example.com', 'demo13@example.com', 'demo16@example.com',
                 'demo17@example.com', 'demo18@example.com', 'demo24@example.com', 'demo28@example.com');

-- Demo leads above are old news: mark their "new lead" notifications as read.
update public.notifications set read_at = now() where kind = 'new_lead' and read_at is null;

-- 6. Phase 3 demo accounts (codes 9xx = demo; real client codes start from 001 and the 9xx
--    numbers never move the real sequence). One per invoicing route of brief §6.
insert into public.accounts (code, name, legal_name, country, market, billing_entity, intermediary_id, currency,
  payment_method, delivery_setup, invoice_format, status, language, notes, is_demo)
values
  ('AMS-NL-901', 'Amstel Refurb Trading (demo)', 'Amstel Refurb Trading BV', 'NL', 'EU', 'ever_state',
   (select id from public.intermediaries where name = 'Global Connect'), 'EUR', 'wire', 'client_label',
   '{"battery_line_separate": true, "show_ce_text": true, "show_note": false}', 'active', 'en',
   'Route B: invoiced through Global Connect (EUR). Client labels. Orders confirmed by Daan.', true),
  ('BER-DE-902', 'Berlin Phone Depot (demo)', 'Berlin Phone Depot GmbH', 'DE', 'EU', 'ever_state', null, 'USD',
   'wire', 'our_booking', '{"battery_line_separate": false, "show_ce_text": true, "show_note": false}', 'active', 'en',
   'EU direct, USD wire. We book the courier (freight recharged). Battery absorbed in the unit price.', true),
  ('MEX-MX-903', 'Mexicell Distribuciones (demo)', 'Mexicell Distribuciones SA de CV', 'MX', 'LATAM', 'ever_state', null,
   'USD', 'usdt', 'client_label', '{"battery_line_separate": true, "show_ce_text": false, "show_note": false}', 'active', 'es',
   'LATAM, pays USDT TRC-20 (0.85 % fee line). Miami forwarder labels.', true),
  ('MIA-US-904', 'Miami Wireless Hub (demo)', 'Miami Wireless Hub LLC', 'US', 'US', 'streamline_fze', null, 'USD',
   'wire', 'client_label', '{"battery_line_separate": true, "show_ce_text": false, "show_note": true}', 'onboarding', 'en',
   'Invoiced through Streamline Smartphone Distribution FZE.', true)
on conflict (code) do nothing;

insert into public.account_assignments (account_id, user_id, role_on_account)
select a.id, p.user_id, x.role::public.account_role
  from (values ('AMS-NL-901', 'yessica.demo@hk-refurbished-stock.com', 'owner'),
               ('MEX-MX-903', 'yessica.demo@hk-refurbished-stock.com', 'owner'),
               ('BER-DE-902', 'gabriel.demo@hk-refurbished-stock.com', 'owner'),
               ('MIA-US-904', 'gabriel.demo@hk-refurbished-stock.com', 'owner'),
               ('AMS-NL-901', 'atreyi.demo@hk-refurbished-stock.com', 'specialist'),
               ('BER-DE-902', 'atreyi.demo@hk-refurbished-stock.com', 'specialist'),
               ('MEX-MX-903', 'atreyi.demo@hk-refurbished-stock.com', 'specialist'),
               ('MIA-US-904', 'atreyi.demo@hk-refurbished-stock.com', 'specialist')) as x(code, email, role)
  join public.accounts a on a.code = x.code
  join public.profiles p on p.email = x.email
on conflict do nothing;

insert into public.contacts (account_id, name, role, phone_e164, email, language, whatsapp_opt_in)
select a.id, x.name, x.role, x.phone, x.email, x.lang, true
  from (values ('AMS-NL-901', 'Daan Visser', 'Confirms orders', '+31611990001', 'daan@example.com', 'en'),
               ('AMS-NL-901', 'Eva Jansen', 'Confirms payments', '+31611990002', 'eva@example.com', 'en'),
               ('BER-DE-902', 'Lukas Weber', 'Owner', '+4915119900003', 'lukas@example.com', 'en'),
               ('MEX-MX-903', 'Carlos Ramírez', 'Compras', '+525511990004', 'carlos@example.com', 'es'),
               ('MIA-US-904', 'Mike Johnson', 'Purchasing', '+13055990005', 'mike@example.com', 'en')) as x(code, name, role, phone, email, lang)
  join public.accounts a on a.code = x.code
 where not exists (select 1 from public.contacts c where c.account_id = a.id and c.email = x.email);

-- 7. Twelve demo orders across the lifecycle, with payments and IMEIs (Phase 3).
do $$
declare
  v_acc uuid; v_order uuid; v_line uuid; r record; l text; i int; v_imei text; v_amount numeric;
  v_sku13 uuid := (select id from public.skus where model = 'iPhone 13' and storage_gb = 128 limit 1);
  v_sku14 uuid := (select id from public.skus where model = 'iPhone 14 Pro' and storage_gb = 256 limit 1);
  v_sku15 uuid := (select id from public.skus where model = 'iPhone 15' and storage_gb = 128 limit 1);
  v_sku16 uuid := (select id from public.skus where model = 'iPhone 16' and storage_gb = 128 limit 1);
  v_imei_seq bigint := 35000000000000;
begin
  if exists (select 1 from public.orders o join public.accounts a on a.id = o.account_id where a.is_demo) then
    return; -- already seeded
  end if;
  -- Luhn check digit for demo IMEIs (14 digits + 1)
  create or replace function pg_temp.luhn(p text) returns text language plpgsql as $f$
  declare s int := 0; d int; k int;
  begin
    for k in 1..14 loop
      d := substr(p, 15 - k, 1)::int;
      if k % 2 = 1 then d := d * 2; if d > 9 then d := d - 9; end if; end if;
      s := s + d;
    end loop;
    return p || ((10 - s % 10) % 10)::text;
  end $f$;

  for r in
    select * from (values
      -- code, status, days ago, partner EUR, lines "sku|qty|price|battery|batt_unit", payments "type|amount|confirmed", imeis, tracking, courier, eta in days
      ('AMS-NL-901', 'closed',         95, 41500.00::numeric, array['13|200|142|1|8', '14|100|118|1|10'], array['deposit|auto|1', 'balance|auto|1'], 12, 'DHL 4471820051', 'DHL', -80),
      ('AMS-NL-901', 'shipped',        30, 33400.00,          array['15|150|182|1|10', '13|50|142|1|8'],  array['deposit|auto|1', 'balance|auto|1'], 10, 'DHL 4471820099', 'DHL', -10),
      ('AMS-NL-901', 'ready_to_ship',  14, 29800.00,          array['14|120|265|1|10'],                  array['deposit|auto|1'],                   0,  null, null, 1),
      ('BER-DE-902', 'delivered',      60, null,              array['13|180|150|0|0'],                   array['deposit|auto|1', 'balance|auto|1'], 8, 'UPS 1Z999AA10', 'UPS', -45),
      ('BER-DE-902', 'in_preparation', 10, null,              array['15|130|190|0|0'],                   array['deposit|auto|1'],                   0,  null, null, 6),
      ('BER-DE-902', 'invoiced',        3, null,              array['16|110|240|0|0'],                   array[]::text[],                           0,  null, null, null),
      ('MEX-MX-903', 'balance_paid',   20, null,              array['13|150|141|1|8', '15|60|183|1|10'], array['deposit|auto|1', 'balance|auto|1'], 6, null, null, -2),
      ('MEX-MX-903', 'deposit_paid',    7, null,              array['14|90|262|1|10'],                   array['deposit|auto|1'],                   0,  null, null, 10),
      ('MEX-MX-903', 'quoted',          1, null,              array['16|100|238|1|10'],                  array[]::text[],                           0,  null, null, null),
      ('MIA-US-904', 'shipped',        25, null,              array['13|160|143|1|8'],                   array['deposit|auto|1', 'balance|auto|1'], 8, 'FedEx 7712 3456 7890', 'FedEx', -8),
      ('MIA-US-904', 'invoiced',        2, null,              array['14|250|268|1|10'],                  array['deposit|short:36.37|0'],                   0,  null, null, null),
      ('MIA-US-904', 'quoted',          0, null,              array['15|120|185|1|10'],                  array[]::text[],                           0,  null, null, null)
    ) as t(code, status, days_ago, eur, lines, pays, imeis, tracking, courier, eta)
  loop
    v_acc := (select id from public.accounts where code = r.code);
    insert into public.orders (account_id, status, order_date, payment_method, delivery_setup, partner_invoice_eur,
                               partner_invoice_no, hk_invoice_no, eta_date, tracking, courier, ship_date, delivered_date,
                               freight_usd, ship_to)
    select v_acc, r.status::public.order_status, current_date - r.days_ago, a.payment_method, a.delivery_setup, r.eur,
           case when r.eur is not null then 'GC-' || to_char(current_date - r.days_ago, 'YYMMDD') end,
           case when r.status <> 'quoted' then to_char(current_date - r.days_ago, 'MMDDYYYY') || '-1' end,
           current_date + r.eta, r.tracking, r.courier,
           case when r.status in ('shipped', 'delivered', 'closed') then current_date - r.days_ago + 12 end,
           case when r.status in ('delivered', 'closed') then current_date - r.days_ago + 18 end,
           case when a.delivery_setup = 'our_booking' then 650 else 0 end,
           jsonb_build_object('name', a.legal_name, 'country', a.country, 'contact', 'Reception', 'address', 'Demo street 1')
      from public.accounts a where a.id = v_acc
    returning id into v_order;

    foreach l in array r.lines loop
      insert into public.order_lines (order_id, sku_id, qty, unit_price_usd, battery_new, battery_unit_usd)
      values (v_order,
              case split_part(l, '|', 1) when '13' then v_sku13 when '14' then v_sku14 when '15' then v_sku15 else v_sku16 end,
              split_part(l, '|', 2)::int, split_part(l, '|', 3)::numeric,
              split_part(l, '|', 4) = '1', split_part(l, '|', 5)::numeric)
      returning id into v_line;
      -- admin-only base price (≈ 6 % under the unit price) so the margin shows for Gabriel
      insert into public.order_lines_finance (order_line_id, base_price_usd)
      values (v_line, round(split_part(l, '|', 3)::numeric / 1.06, 2));
    end loop;

    foreach l in array r.pays loop
      select case split_part(l, '|', 1) when 'deposit' then ov.deposit_payable - ov.deposit_confirmed
                  else ov.payable_total - ov.deposit_payable - ov.balance_confirmed end
             - case when split_part(l, '|', 2) like 'short:%' then split_part(split_part(l, '|', 2), ':', 2)::numeric else 0 end
        into v_amount
        from public.order_overview ov where ov.id = v_order;
      insert into public.payments (order_id, type, amount, method, received_at, reference, difference_reason, notes)
      values (v_order, split_part(l, '|', 1)::public.payment_type, v_amount,
              (select payment_method from public.accounts where id = v_acc), current_date - r.days_ago + 2,
              case when (select payment_method from public.accounts where id = v_acc) = 'usdt' then 'TXID demo ' || substr(md5(l || r.code), 1, 16)
                   else 'MT103 demo ' || substr(md5(l || r.code), 1, 8) end,
              case when split_part(l, '|', 3) = '0' then 'short_payment' end,
              case when split_part(l, '|', 3) = '0' then 'Demo of SOP P3: short deposit, waiting for the admin.' end);
      if split_part(l, '|', 3) = '1' then
        update public.payments set status = 'confirmed' where order_id = v_order and status = 'awaiting_confirmation';
      end if;
    end loop;

    for i in 1..r.imeis loop
      v_imei_seq := v_imei_seq + 1;
      v_imei := pg_temp.luhn(lpad(v_imei_seq::text, 14, '0'));
      insert into public.imei_master (imei, sku_id, order_id, account_id, shipped_at)
      values (v_imei, (select sku_id from public.order_lines where order_id = v_order order by sort_order, created_at limit 1),
              v_order, v_acc, case when r.status in ('shipped', 'delivered', 'closed') then current_date - r.days_ago + 12 end)
      on conflict (imei) do nothing;
    end loop;
  end loop;
end $$;

-- The demo payments above are history: their "to confirm" notices are already read,
-- except the short deposit, which is the example of an item waiting for the admin.
update public.notifications set read_at = now()
 where kind in ('payment_to_confirm', 'order_ready') and read_at is null
   and link not in (select '/orders/' || p.order_id from public.payments p where p.status = 'awaiting_confirmation');
