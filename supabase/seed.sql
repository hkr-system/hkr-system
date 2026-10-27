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
