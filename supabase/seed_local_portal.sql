-- =============================================================================
-- LOCAL DEVELOPMENT ONLY. Two demo CLIENT logins for the portal (no password: they
-- sign in with an email link, which locally lands in Mailpit at http://127.0.0.1:54324).
--   daan@example.com   → AMS-NL-901 (English)
--   carlos@example.com → MEX-MX-903 (Spanish)
-- On the hosted project clients are invited from Accounts → <account> → Portal.
-- =============================================================================
do $$
declare
  u record; v_id uuid;
begin
  for u in
    select * from (values ('daan@example.com', 'AMS-NL-901', 'en'), ('carlos@example.com', 'MEX-MX-903', 'es')) as t(email, code, lang)
  loop
    select id into v_id from auth.users where email = u.email;
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email, '', now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
    end if;
    insert into public.portal_users (user_id, account_id, contact_id, email, language)
    select v_id, a.id, (select c.id from public.contacts c where c.account_id = a.id and c.email = u.email limit 1), u.email, u.lang
      from public.accounts a where a.code = u.code
    on conflict (user_id) do nothing;
  end loop;
end $$;
