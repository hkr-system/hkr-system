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
