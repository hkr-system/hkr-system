-- The account specialist adds and edits intermediaries & clearance companies (Gabriel, Nov 18 2026: "Atreyi hará onboarding de
-- algunas cuentas, es importante que pueda agregarlos también"). Removing a company stays admin only.
drop policy intermediaries_admin_insert on public.intermediaries;
create policy intermediaries_insert on public.intermediaries
  for insert to authenticated with check ((select public.current_app_role()) in ('admin', 'account_specialist'));
drop policy intermediaries_admin_update on public.intermediaries;
create policy intermediaries_update on public.intermediaries
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'account_specialist'))
  with check ((select public.current_app_role()) in ('admin', 'account_specialist'));
