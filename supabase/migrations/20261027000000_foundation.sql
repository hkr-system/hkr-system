-- =============================================================================
-- HKR System — Phase 0 foundation
--   * roles and profiles (one row per Supabase Auth user)
--   * RLS helper functions: is_admin(), has_account_access(), can_see_finance()
--   * row stamps (created_at / created_by / updated_at) and audit_log on every table
--   * base tables: accounts (skeleton), account_assignments, intermediaries, skus,
--     settings, scoring_rules
--   * default settings taken from the build brief §3
--
-- Safe to run once on an empty project. It does not drop or delete anything.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Default privileges: nobody gets access by default, RLS + explicit grants decide
-- -----------------------------------------------------------------------------
-- The anonymous (logged-out) role gets nothing in Phase 0. Public pages added later
-- (e.g. the /apply form in Phase 1) go through server code, not direct table access.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'bd', 'account_specialist');
create type public.market as enum ('EU', 'LATAM', 'US', 'ROW');
create type public.account_role as enum ('owner', 'specialist');

-- -----------------------------------------------------------------------------
-- 2. Audit log (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text        not null,
  row_id      text,
  action      text        not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  diff        jsonb,
  user_id     uuid,
  at          timestamptz not null default now()
);
create index audit_log_table_row_idx on public.audit_log (table_name, row_id);
create index audit_log_at_idx on public.audit_log (at desc);
alter table public.audit_log enable row level security;

-- Nobody may change or remove audit rows, not even the database owner by accident.
create function public.audit_log_block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_block_changes();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_block_changes();

-- Generic audit trigger: INSERT stores the new row, UPDATE stores only changed
-- fields as {field: {old, new}}, DELETE stores the old row.
-- TG_ARGV[0] = name of the primary-key column (default 'id').
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old  jsonb;
  v_new  jsonb;
  v_diff jsonb;
  v_pk   text := coalesce(tg_argv[0], 'id');
begin
  if tg_op = 'INSERT' then
    v_new  := to_jsonb(new);
    v_diff := jsonb_build_object('new', v_new);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select jsonb_object_agg(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k))
      into v_diff
      from jsonb_object_keys(v_new) as k
     where (v_old -> k) is distinct from (v_new -> k)
       and k <> 'updated_at';
    if v_diff is null then
      return new;  -- nothing really changed
    end if;
  else
    v_old  := to_jsonb(old);
    v_diff := jsonb_build_object('old', v_old);
  end if;

  insert into public.audit_log (table_name, row_id, action, diff, user_id)
  values (tg_table_name, coalesce(v_new ->> v_pk, v_old ->> v_pk), tg_op, v_diff, auth.uid());

  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Row stamps: created_at / created_by / updated_at are set by the database,
--    never trusted from the client.
-- -----------------------------------------------------------------------------
create function public.stamp_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- One call per new table: switches RLS on, adds the stamp trigger and the audit
-- trigger. Every migration that creates a table must call it (checked by
-- public.security_check()).
create function public.setup_table(p_table regclass, p_pk text default 'id')
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format(
    'create trigger stamp_row before insert or update on %s for each row execute function public.stamp_row()',
    p_table);
  execute format(
    'create trigger audit_row after insert or update or delete on %s for each row execute function public.audit_row_change(%L)',
    p_table, p_pk);
end;
$$;
revoke execute on function public.setup_table(regclass, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Profiles (one per Supabase Auth user)
-- -----------------------------------------------------------------------------
create table public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text        not null unique,
  full_name   text        not null default '',
  role        public.app_role,                 -- null = no access yet
  timezone    text        not null default 'America/El_Salvador',
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
select public.setup_table('public.profiles', 'user_id');

-- New Auth user → profile row with NO role. Only an admin gives a role.
-- (Any "role" a user puts in their own sign-up metadata is ignored on purpose.)
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create function public.handle_auth_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where user_id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_auth_email_change();

-- -----------------------------------------------------------------------------
-- 5. Accounts (skeleton — Phase 3 adds the remaining fields) and assignments
-- -----------------------------------------------------------------------------
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  code        text        not null unique,
  name        text        not null,
  country     text,
  market      public.market,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
select public.setup_table('public.accounts');

create table public.account_assignments (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  user_id          uuid not null references public.profiles (user_id) on delete cascade,
  role_on_account  public.account_role not null,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now(),
  unique (account_id, user_id, role_on_account)
);
create index account_assignments_user_idx on public.account_assignments (user_id);
select public.setup_table('public.account_assignments');

-- -----------------------------------------------------------------------------
-- 6. RLS helper functions
--    security definer so they can read profiles/assignments without recursion;
--    fixed empty search_path so they cannot be hijacked.
-- -----------------------------------------------------------------------------
create function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
    from public.profiles p
   where p.user_id = (select auth.uid())
     and p.active;
$$;

-- Any active user with a role (admin, bd or account_specialist).
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_app_role() is not null;
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

-- Confidential finance (base cost, margin, profit, engine parameters, company
-- totals): admin only (brief §3 row 2).
create function public.can_see_finance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin();
$$;

-- Which accounts a user may see (brief §8):
--   admin, account_specialist → all accounts
--   bd                        → only accounts where they are the owner
create function public.has_account_access(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.current_app_role()
           when 'admin' then true
           when 'account_specialist' then true
           when 'bd' then exists (
             select 1
               from public.account_assignments a
              where a.account_id = p_account_id
                and a.user_id = (select auth.uid())
                and a.role_on_account = 'owner')
           else false
         end;
$$;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.can_see_finance() from public, anon;
revoke execute on function public.has_account_access(uuid) from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_see_finance() to authenticated;
grant execute on function public.has_account_access(uuid) to authenticated;

-- Internal functions: never callable through the API.
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.audit_log_block_changes() from public, anon, authenticated;
revoke execute on function public.stamp_row() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_email_change() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Reference tables
-- -----------------------------------------------------------------------------
create table public.intermediaries (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null unique,
  country                 text,
  address                 text,
  contact                 text,
  default_cutoff_weekday  smallint check (default_cutoff_weekday between 1 and 7), -- ISO: 1 = Mon … 7 = Sun
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now()
);
select public.setup_table('public.intermediaries');

create table public.skus (
  id                uuid primary key default gen_random_uuid(),
  model             text    not null,
  storage_gb        integer not null check (storage_gb > 0),
  color             text    not null,
  grade             text    not null default 'A+++',
  battery_eligible  boolean not null default true,  -- iPhone 16 series = false (brief §6)
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  unique (model, storage_gb, color, grade)
);
select public.setup_table('public.skus');

-- Parameters edited by admin in Settings. confidential = true rows (engine
-- parameters, margin floor…) are invisible to everyone except can_see_finance().
create table public.settings (
  key           text primary key,
  value         jsonb   not null,
  category      text    not null,
  label         text    not null,
  description   text,
  confidential  boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now()
);
select public.setup_table('public.settings', 'key');

-- Lead scoring rules (brief §3 row 8). Phase 1 reads them; editable in Settings.
create table public.scoring_rules (
  id           uuid primary key default gen_random_uuid(),
  label        text    not null,
  field        text    not null,
  operator     text    not null check (operator in ('eq', 'gte', 'between', 'in', 'in_setting')),
  value        jsonb,
  points       integer not null default 0,
  disqualify   boolean not null default false,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now()
);
select public.setup_table('public.scoring_rules');

-- -----------------------------------------------------------------------------
-- 8. Grants (RLS policies below decide which rows)
-- -----------------------------------------------------------------------------
revoke all on public.audit_log, public.profiles, public.accounts, public.account_assignments,
              public.intermediaries, public.skus, public.settings, public.scoring_rules
  from anon;

grant select on public.audit_log to authenticated;
revoke insert, update, delete, truncate on public.audit_log from authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, role, timezone, active) on public.profiles to authenticated;
revoke insert, delete, truncate on public.profiles from authenticated;

grant select, insert, update, delete on public.accounts, public.account_assignments,
  public.intermediaries, public.skus, public.settings, public.scoring_rules to authenticated;

-- -----------------------------------------------------------------------------
-- 9. RLS policies
-- -----------------------------------------------------------------------------
-- audit_log: admin reads; nobody writes through the API (the trigger writes).
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using ((select public.is_admin()));

-- profiles: staff see the team list (names, roles); a user without a role still
-- sees their own row (so the app can say "no access yet"). Only admin edits.
create policy profiles_read on public.profiles
  for select to authenticated
  using ((select public.is_staff()) or user_id = (select auth.uid()));
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- accounts: visible per has_account_access; edits admin-only until Phase 3
-- refines them (bd own accounts, specialist operational fields).
create policy accounts_read on public.accounts
  for select to authenticated using (public.has_account_access(id));
create policy accounts_admin_insert on public.accounts
  for insert to authenticated with check ((select public.is_admin()));
create policy accounts_admin_update on public.accounts
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy accounts_admin_delete on public.accounts
  for delete to authenticated using ((select public.is_admin()));

-- account_assignments: you see the assignments of accounts you can see.
create policy account_assignments_read on public.account_assignments
  for select to authenticated
  using (public.has_account_access(account_id) or user_id = (select auth.uid()));
create policy account_assignments_admin_insert on public.account_assignments
  for insert to authenticated with check ((select public.is_admin()));
create policy account_assignments_admin_update on public.account_assignments
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy account_assignments_admin_delete on public.account_assignments
  for delete to authenticated using ((select public.is_admin()));

-- intermediaries, skus, scoring_rules: every staff user reads, admin writes.
create policy intermediaries_read on public.intermediaries
  for select to authenticated using ((select public.is_staff()));
create policy intermediaries_admin_insert on public.intermediaries
  for insert to authenticated with check ((select public.is_admin()));
create policy intermediaries_admin_update on public.intermediaries
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy intermediaries_admin_delete on public.intermediaries
  for delete to authenticated using ((select public.is_admin()));

create policy skus_read on public.skus
  for select to authenticated using ((select public.is_staff()));
create policy skus_admin_insert on public.skus
  for insert to authenticated with check ((select public.is_admin()));
create policy skus_admin_update on public.skus
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy skus_admin_delete on public.skus
  for delete to authenticated using ((select public.is_admin()));

create policy scoring_rules_read on public.scoring_rules
  for select to authenticated using ((select public.is_staff()));
create policy scoring_rules_admin_insert on public.scoring_rules
  for insert to authenticated with check ((select public.is_admin()));
create policy scoring_rules_admin_update on public.scoring_rules
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy scoring_rules_admin_delete on public.scoring_rules
  for delete to authenticated using ((select public.is_admin()));

-- settings: staff read non-confidential rows; confidential rows only with
-- can_see_finance(); only admin writes.
create policy settings_read on public.settings
  for select to authenticated
  using ((select public.is_staff()) and (not confidential or (select public.can_see_finance())));
create policy settings_admin_insert on public.settings
  for insert to authenticated with check ((select public.is_admin()));
create policy settings_admin_update on public.settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy settings_admin_delete on public.settings
  for delete to authenticated using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 10. Safety check: lists every public table missing RLS, the stamp trigger or
--     the audit trigger. Must return zero rows. Admin (or SQL Editor) only.
-- -----------------------------------------------------------------------------
create function public.security_check()
returns table (table_name text, problem text)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select c.oid, c.relname::text as name, c.relrowsecurity as rls
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  )
  select name, 'RLS is OFF' from t where not rls
  union all
  select name, 'missing audit trigger' from t
   where name <> 'audit_log'
     and not exists (select 1 from pg_catalog.pg_trigger g
                      where g.tgrelid = t.oid and g.tgname = 'audit_row')
  union all
  select name, 'missing stamp trigger' from t
   where name <> 'audit_log'
     and not exists (select 1 from pg_catalog.pg_trigger g
                      where g.tgrelid = t.oid and g.tgname = 'stamp_row')
  union all
  select name, 'anon role has table privileges' from t
   where exists (select 1 from information_schema.role_table_grants r
                  where r.table_schema = 'public' and r.table_name = t.name and r.grantee = 'anon')
  order by 1, 2;
$$;
revoke execute on function public.security_check() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 11. Default settings (values from the build brief §3; editable in Settings)
-- -----------------------------------------------------------------------------
insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  -- Operations calendar (§3 row 11)
  ('thursday_weekday', 'operations', 'Client update day', '4', false, 10,
   'ISO weekday (1 = Monday … 7 = Sunday). 4 = Thursday, the client update day.'),
  ('batch_cutoff', 'operations', 'EU RMA batch cutoff',
   '{"weekday": 5, "time": "12:00", "timezone": "Europe/Amsterdam"}', false, 20,
   'Friday 12:00 Central European time. Follows European summer time (always 12:00 on the Amsterdam clock), confirmed by Gabriel Oct 2026.'),
  ('report_time', 'operations', 'Daily report time',
   '{"time": "18:00", "timezone": "Asia/Hong_Kong"}', false, 30,
   'Internal Orders and Internal RMA''s reports are generated and emailed at this time (§3 row 10).'),
  ('invoice_number_format', 'operations', 'Invoice numbering', '"MMDDYYYY-seq"', false, 40,
   'Client invoice number pattern (§3 row 14). Credit notes: CN + invoice number + sequence.'),

  -- Price-list engine (§3 row 12) — confidential
  ('base_margin_pct', 'engine', 'Base list margin %', '6', true, 100,
   'Margin built into the base list. Raw cost = base ÷ (1 + this %).'),
  ('engine_rma_floor_pct', 'engine', 'RMA amortization floor %', '0.5', true, 110, 'Minimum RMA_c.'),
  ('engine_rma_default_pct', 'engine', 'RMA amortization default %', '1.0', true, 120, 'RMA_c when there is no history.'),
  ('engine_rma_cap_pct', 'engine', 'RMA amortization cap %', '1.5', true, 130, 'Maximum RMA_c.'),
  ('engine_extra_step_pct', 'engine', 'Extra margin step %', '0.5', true, 140, 'Extra_c per point.'),
  ('engine_extra_max_pct', 'engine', 'Extra margin max %', '2.0', true, 150, 'Maximum Extra_c.'),
  ('engine_combined_max_pct', 'engine', 'Combined max %', '3.5', true, 160, 'Maximum RMA_c + Extra_c.'),
  ('engine_refresh_days', 'engine', 'Client list refresh (days)', '14', true, 170, 'Client price lists are refreshed every 2 weeks.'),

  -- Weekly promotions (§3 row 13)
  ('promo_min_qty', 'promotions', 'Promotion tier: min pcs', '100', false, 200, 'Default quantity tier, lower bound.'),
  ('promo_max_qty', 'promotions', 'Promotion tier: max pcs', '150', false, 210, 'Default quantity tier, upper bound.'),
  ('promo_discount_min_usd', 'promotions', 'Promotion discount: min US$/unit', '3', false, 220, 'Default discount range, lower bound.'),
  ('promo_discount_max_usd', 'promotions', 'Promotion discount: max US$/unit', '4', false, 230, 'Default discount range, upper bound.'),
  ('promo_margin_floor_pct', 'promotions', 'Real-margin floor %', '4', true, 240,
   'Floor price = raw cost ÷ (1 − this %). The engine blocks or trims any SKU below it.'),
  ('promo_discount_cap_usd', 'promotions', 'Promotion discount cap US$/unit', '5', true, 250, 'Hard cap per unit.'),

  -- Lead scoring (§3 row 8)
  ('lead_tier_thresholds', 'leads', 'Lead tier thresholds', '{"A": 70, "B": 40}', false, 300,
   'Tier A ≥ A, Tier B ≥ B and < A, Tier C < B.'),
  ('lead_target_countries', 'leads', 'Target countries (ISO codes)', '[]', false, 310,
   'Countries that earn the "target country" points. NOT DEFINED in the brief yet — to fill before Phase 1.');

insert into public.scoring_rules (label, field, operator, value, points, disqualify, sort_order) values
  ('Target country', 'country', 'in_setting', '"lead_target_countries"', 30, false, 10),
  ('Sells iPhones', 'sells_iphones', 'eq', 'true', 25, false, 20),
  ('Declared volume ≥ 400 units/month', 'volume_units_month', 'gte', '400', 25, false, 30),
  ('Declared volume 100–399 units/month', 'volume_units_month', 'between', '[100, 399]', 10, false, 40),
  ('Sells refurbished', 'sells_refurbished', 'eq', 'true', 10, false, 50),
  ('Excluded business type', 'business_type', 'in',
   '["pawn_shop", "new_only_retailer", "large_chain", "dropshipping", "operator", "repair_only"]', 0, true, 60);
