-- =============================================================================
-- LOCAL DEVELOPMENT ONLY (supabase start / supabase db reset).
-- Creates the four demo Auth users with a local-only password so tests can log in.
-- On the hosted project the users are created by hand in the dashboard instead —
-- never run this file there.
-- Local password for all four: LocalDemo-2026!
-- =============================================================================
do $$
declare
  u record;
  v_id uuid;
begin
  for u in
    select * from (values
      ('gabriel.demo@hk-refurbished-stock.com'),
      ('yessica.demo@hk-refurbished-stock.com'),
      ('arslan.demo@hk-refurbished-stock.com'),
      ('atreyi.demo@hk-refurbished-stock.com')
    ) as t(email)
  loop
    if exists (select 1 from auth.users where email = u.email) then
      continue;
    end if;
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('LocalDemo-2026!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;
end $$;
