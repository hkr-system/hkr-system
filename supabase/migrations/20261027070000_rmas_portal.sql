-- =============================================================================
-- HKR System — Phase 4 (RMAs, weekly EU batches, credit notes) + client portal
-- Brief §6/§7 Phase 4; SOP P6 (RMA intake), P10 (credit notes), P11 (EU batch);
-- templates received Oct 27 2026 (RMA Request Form, client tracker, batch, credit note).
-- Decisions (Gabriel, Oct 27 2026):
--   * RMA number <code>-RMA-NN, credit note number <code>-CN-NN (per account)
--   * resolution per unit: return_hk / repair_credit / credit_note / replacement / not_covered
--   * two statuses: the RMA case (brief flow) + each unit (tracker list)
--   * credit cap = invoice value × 1 % (SOP P6): above it → warning, admin can still approve
--   * client portal: clients are NOT staff (no app_role); they read their own account only
--     through the portal_* views and write only through the portal_* functions below.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Types and settings
-- -----------------------------------------------------------------------------
create type public.rma_status as enum
  ('requested', 'form_received', 'verified', 'approved', 'awaiting_return', 'credit_agreed',
   'in_batch', 'received_hk', 'closed');
create type public.rma_unit_status as enum
  ('reported', 'verified', 'awaiting_shipment', 'shipped_to_hk', 'received_hk', 'returned_to_client',
   'credited', 'rejected', 'closed');
create type public.rma_resolution as enum
  ('pending', 'return_hk', 'repair_credit', 'credit_note', 'replacement', 'not_covered');
create type public.rma_source as enum ('testing', 'end_customer');
create type public.imei_check as enum ('ours', 'not_found');
create type public.rma_channel as enum ('portal', 'internal', 'import');
create type public.units_location as enum ('with_client', 'at_intermediary', 'at_end_customer');
create type public.rma_batch_status as enum ('open', 'shipped', 'received');
create type public.credit_note_status as enum ('draft', 'approved', 'issued', 'applied', 'cancelled');
create type public.credit_applied_to as enum ('next_invoice', 'order_balance', 'refund');

-- New file kinds for RMA folders (SOP §2.3). Used only as text in this file (a new enum value
-- cannot be used in the same transaction that adds it).
alter type public.file_kind add value if not exists 'FORM';
alter type public.file_kind add value if not exists 'PRUEBAS';
alter type public.file_kind add value if not exists 'VERIF';
alter type public.file_kind add value if not exists 'TRK';

insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('warranty_months', 'terms', 'Warranty (months)', '12', false, 100,
   'Warranty window from delivery (SOP: 12 months). RMA units outside it are flagged "not covered".'),
  ('rma_credit_cap_pct', 'terms', 'RMA credit cap (% of invoice)', '1', false, 110,
   'SOP P6/P10: repair-credit cap = invoice value × 1 % (US$200 per US$20,000). Above it the RMA shows a red warning; only admin approves.'),
  ('rma_batch_email_to', 'operations', 'EU batch email recipients', '[]', false, 25,
   'JSON list of emails that receive the "batch shipped" email with the consolidated Excel and the label (brief Phase 4). Example: ["name@company.com"].'),
  ('credit_note_issuer', 'operations', 'Credit note issuer and signer', '{}', false, 45,
   'JSON shown on credit notes: {"company": "...", "address": ["line 1", "line 2"], "phone": "...", "whatsapp": "...", "signer_name": "...", "signer_title": "..."}. Kept here, never in the code.')
on conflict (key) do nothing;

-- Fault categories of the RMA Request Form (exact list of the template).
create function public.rma_fault_categories()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['No power / dead', 'Battery / charging', 'Screen / touch', 'Display (lines / spots / backlight)',
               'Camera', 'Face ID / Touch ID', 'Audio / microphone / speaker', 'SIM / network / signal',
               'Wi-Fi / Bluetooth', 'Buttons / vibration', 'Cosmetic / grading', 'Other'];
$$;
grant execute on function public.rma_fault_categories() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Client portal users (created ONLY by HKR staff; no self sign-up)
-- -----------------------------------------------------------------------------
create table public.portal_users (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.profiles (user_id) on delete cascade,
  account_id     uuid not null references public.accounts (id) on delete cascade,
  contact_id     uuid references public.contacts (id) on delete set null,
  email          text not null,
  language       text not null default 'en' check (language in ('en', 'es')),
  active         boolean not null default true,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now()
);
create index portal_users_account_idx on public.portal_users (account_id);
select public.setup_table('public.portal_users');

-- The account of the logged-in CLIENT (null for staff and for everyone else).
create function public.portal_account_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pu.account_id
    from public.portal_users pu
    join public.profiles p on p.user_id = pu.user_id
   where pu.user_id = (select auth.uid())
     and pu.active and p.active and p.role is null;
$$;
revoke execute on function public.portal_account_id() from public, anon;
grant execute on function public.portal_account_id() to authenticated;

-- A portal user can never become staff, and a staff user can never become a portal user.
create function public.portal_users_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where user_id = new.user_id and role is not null) then
    raise exception 'This login belongs to an HKR team member; it cannot be a client portal user.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger portal_users_guard
  before insert or update of user_id on public.portal_users
  for each row execute function public.portal_users_guard();
revoke execute on function public.portal_users_guard() from public, anon, authenticated;

create function public.profiles_portal_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is not null and old.role is null
     and exists (select 1 from public.portal_users where user_id = new.user_id) then
    raise exception 'This login is a client portal user; it cannot get an HKR role.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_portal_guard
  before update of role on public.profiles
  for each row execute function public.profiles_portal_guard();
revoke execute on function public.profiles_portal_guard() from public, anon, authenticated;

-- Who may invite / disable portal users: admin and account specialists (with account access).
create function public.can_manage_portal(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_app_role() in ('admin', 'account_specialist') and public.has_account_access(p_account);
$$;
revoke execute on function public.can_manage_portal(uuid) from public, anon;
grant execute on function public.can_manage_portal(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Weekly EU batch (P11) — declared first, units point to it
-- -----------------------------------------------------------------------------
create table public.rma_batches (
  id                    uuid primary key default gen_random_uuid(),
  intermediary_id       uuid not null references public.intermediaries (id) on delete restrict,
  cutoff_date           date not null,                 -- the Friday (12:00 Amsterdam)
  status                public.rma_batch_status not null default 'open',
  pickup_date           date,
  carrier               text not null default 'DHL Express',
  awb                   text,
  boxes                 integer check (boxes >= 0),
  weight_kg             numeric(8, 2) check (weight_kg >= 0),
  label_path            text,                          -- account-files/batches/<batch id>/… (the batch mixes clients)
  label_name            text,
  email_sent_at         timestamptz,
  shipped_at            timestamptz,
  received_at           timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  unique (intermediary_id, cutoff_date)
);
select public.setup_table('public.rma_batches');

-- -----------------------------------------------------------------------------
-- 4. RMAs (one claim of a client) and units (one row per IMEI)
-- -----------------------------------------------------------------------------
create table public.rmas (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete restrict,
  number           text not null default '',            -- <code>-RMA-NN, set by trigger
  status           public.rma_status not null default 'requested',
  channel          public.rma_channel not null default 'internal',
  units_location   public.units_location,
  order_refs       text,                                -- order / invoice numbers as the client wrote them
  contact_name     text,
  contact_info     text,                                -- email / WhatsApp given on the form
  client_notes     text,                                -- what the client asks
  internal_notes   text,                                -- never shown in the portal
  submitted_at     timestamptz,                         -- form + evidence complete
  approved_by      uuid,
  approved_at      timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now(),
  unique (account_id, number)
);
create index rmas_account_idx on public.rmas (account_id);
create index rmas_status_idx on public.rmas (status);
select public.setup_table('public.rmas');

create table public.rma_units (
  id                uuid primary key default gen_random_uuid(),
  rma_id            uuid not null references public.rmas (id) on delete cascade,
  account_id        uuid not null references public.accounts (id) on delete cascade, -- copied for RLS
  imei              text not null check (imei ~ '^[0-9]{15}$'),
  model             text,
  storage_gb        integer,
  color             text,
  fault_category    text not null check (fault_category = any (public.rma_fault_categories())),
  fault_text        text,
  source            public.rma_source not null default 'testing',
  detected_on       date,
  battery_swollen   boolean not null default false,
  physical_damage   boolean not null default false,
  -- IMEI check against imei_master (set by trigger, never typed)
  imei_check        public.imei_check not null default 'not_found',
  imei_master_id    uuid references public.imei_master (id) on delete set null,
  origin_order_id   uuid references public.orders (id) on delete set null,
  shipped_on        date,
  warranty_ok       boolean,                             -- shipped/delivered + warranty months ≥ detected/reported
  claimed_before    text,                                -- e.g. "ABC-NL-001-RMA-02" when the IMEI was claimed before
  check_note        text,                                -- internal: e.g. "shipped to another account"
  -- decision (SD / admin) and money, tracker "RMA Units"
  resolution        public.rma_resolution not null default 'pending',
  unit_status       public.rma_unit_status not null default 'reported',
  unit_price_usd    numeric(12, 2) check (unit_price_usd >= 0),  -- from the origin HK invoice
  credit_pct        numeric(6, 3) check (credit_pct >= 0 and credit_pct <= 100),
  credit_fixed_usd  numeric(12, 2) check (credit_fixed_usd >= 0),
  credit_usd        numeric(12, 2) generated always as (
                      case when resolution in ('repair_credit', 'credit_note')
                           then coalesce(nullif(credit_fixed_usd, 0), round(coalesce(unit_price_usd, 0) * coalesce(credit_pct, 0) / 100, 2))
                           else 0 end) stored,
  batch_id          uuid references public.rma_batches (id) on delete set null,
  hkr_notes         text,                                -- internal
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  unique (rma_id, imei)
);
create index rma_units_rma_idx on public.rma_units (rma_id);
create index rma_units_imei_idx on public.rma_units (imei);
create index rma_units_batch_idx on public.rma_units (batch_id);
select public.setup_table('public.rma_units');

-- Evidence and RMA documents: files rows with owner_table 'rmas'; a photo/video belongs to one unit.
alter table public.files add column rma_unit_id uuid references public.rma_units (id) on delete set null;
create index files_rma_unit_idx on public.files (rma_unit_id);

-- <code>-RMA-NN per account.
create function public.rmas_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text; v_next int;
begin
  if new.number is null or new.number = '' then
    perform pg_advisory_xact_lock(hashtext('rmas:' || new.account_id::text));
    select code into v_code from public.accounts where id = new.account_id;
    select coalesce(max(substring(number from '-RMA-([0-9]+)$')::int), 0) + 1 into v_next
      from public.rmas where account_id = new.account_id;
    new.number := v_code || '-RMA-' || lpad(v_next::text, 2, '0');
  end if;
  if new.status >= 'form_received' then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  return new;
end;
$$;
create trigger rmas_before_insert
  before insert on public.rmas
  for each row execute function public.rmas_before_insert();
revoke execute on function public.rmas_before_insert() from public, anon, authenticated;

-- IMEI check (SOP P6 + IMEI Master "Check"): OURS only when the IMEI was shipped to THIS
-- account; also the origin order, model, unit price, warranty window and double claims.
create function public.rma_units_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record; v_line record; v_months int := public.setting_num('warranty_months', 12)::int;
  v_ref date; v_prev text; v_rma record;
begin
  select r.account_id, r.status, r.created_at into v_rma from public.rmas r where r.id = new.rma_id;
  new.account_id := v_rma.account_id;
  if tg_op = 'INSERT' or new.imei is distinct from old.imei or new.detected_on is distinct from old.detected_on then
    new.imei_master_id := null; new.origin_order_id := null; new.shipped_on := null; new.check_note := null;
    new.warranty_ok := null; new.imei_check := 'not_found';
    select i.*, o.delivered_date, o.ship_date as order_ship_date
      into m
      from public.imei_master i left join public.orders o on o.id = i.order_id
     where i.imei = new.imei;
    if found then
      if m.account_id = new.account_id then
        new.imei_check := 'ours';
        new.imei_master_id := m.id;
        new.origin_order_id := m.order_id;
        new.shipped_on := coalesce(m.shipped_at, m.order_ship_date);
        if m.sku_id is not null then
          select s.model, s.storage_gb, s.color into v_line from public.skus s where s.id = m.sku_id;
          new.model := coalesce(new.model, v_line.model);
          new.storage_gb := coalesce(new.storage_gb, v_line.storage_gb);
          new.color := coalesce(new.color, v_line.color);
          if new.unit_price_usd is null and m.order_id is not null then
            select l.unit_price_usd into new.unit_price_usd from public.order_lines l
             where l.order_id = m.order_id and l.sku_id = m.sku_id order by l.sort_order limit 1;
          end if;
        end if;
        v_ref := coalesce(m.delivered_date, m.shipped_at, m.order_ship_date);
        if v_ref is not null then
          new.warranty_ok := coalesce(new.detected_on, v_rma.created_at::date) <= (v_ref + make_interval(months => v_months))::date;
        end if;
      else
        new.check_note := 'IMEI shipped to another account';
      end if;
    end if;
    select r.number into v_prev
      from public.rma_units u join public.rmas r on r.id = u.rma_id
     where u.imei = new.imei and u.rma_id <> new.rma_id
     order by r.created_at desc limit 1;
    new.claimed_before := v_prev;
  end if;
  -- only OURS units can get a covered resolution (brief Phase 4: "only OURS can be approved")
  if new.resolution not in ('pending', 'not_covered') and new.imei_check <> 'ours' then
    raise exception 'IMEI % is NOT FOUND for this account: it can only be "Not covered".', new.imei using errcode = '23514';
  end if;
  if new.resolution = 'not_covered' and new.unit_status in ('reported', 'verified') then
    new.unit_status := 'rejected';
  end if;
  -- after approval the decision (resolution, credit) is admin-only
  if tg_op = 'UPDATE' and (select auth.uid()) is not null and not public.is_admin()
     and v_rma.status >= 'approved'
     and (new.resolution, new.credit_pct, new.credit_fixed_usd, new.unit_price_usd)
         is distinct from (old.resolution, old.credit_pct, old.credit_fixed_usd, old.unit_price_usd) then
    raise exception 'The RMA is approved: only an admin changes the resolution or the credit.' using errcode = '42501';
  end if;
  -- the weekly EU batch only takes approved OURS units returning to HK that can fly
  if new.batch_id is not null and (tg_op = 'INSERT' or new.batch_id is distinct from old.batch_id) then
    if new.resolution <> 'return_hk' or new.imei_check <> 'ours' then
      raise exception 'Only OURS units with resolution "Return to HK" go in a batch.' using errcode = '23514';
    end if;
    if new.battery_swollen then
      raise exception 'IMEI %: swollen battery, the unit cannot fly (SOP Module 3 §5).', new.imei using errcode = '23514';
    end if;
    if v_rma.status < 'approved' then
      raise exception 'The RMA must be approved before its units go in a batch.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger rma_units_before_write
  before insert or update on public.rma_units
  for each row execute function public.rma_units_before_write();
revoke execute on function public.rma_units_before_write() from public, anon, authenticated;

-- RMA case rules: approve = admin only, every unit decided; going back = admin only.
create function public.rmas_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_system boolean := (select auth.uid()) is null;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if not v_system and not v_admin and new.status < old.status then
    raise exception 'Only an admin moves an RMA back (% → %).', old.status, new.status using errcode = '23514';
  end if;
  if new.status >= 'approved' and old.status < 'approved' then
    if not v_system and not v_admin then
      raise exception 'Only an admin (Sales Director) approves an RMA (SOP P6).' using errcode = '42501';
    end if;
    if exists (select 1 from public.rma_units where rma_id = new.id and resolution = 'pending') then
      raise exception 'Every unit needs a resolution before the RMA is approved.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.rma_units where rma_id = new.id) then
      raise exception 'The RMA has no units.' using errcode = '23514';
    end if;
    new.approved_by := coalesce(auth.uid(), new.approved_by);
    new.approved_at := now();
  end if;
  if new.status = 'form_received' and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  if new.status = 'closed' then
    new.closed_at := now();
  elsif old.status = 'closed' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;
create trigger rmas_before_update
  before update on public.rmas
  for each row execute function public.rmas_before_update();
revoke execute on function public.rmas_before_update() from public, anon, authenticated;

-- Units follow the case: verified when the case is verified; approved → awaiting shipment
-- (return to HK) / rejected (not covered).
create function public.rmas_after_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified' and old.status < 'verified' then
    update public.rma_units set unit_status = 'verified' where rma_id = new.id and unit_status = 'reported' and imei_check = 'ours';
  end if;
  if new.status >= 'approved' and old.status < 'approved' then
    update public.rma_units set unit_status = 'awaiting_shipment'
     where rma_id = new.id and resolution = 'return_hk' and unit_status in ('reported', 'verified');
    update public.rma_units set unit_status = 'rejected'
     where rma_id = new.id and resolution = 'not_covered' and unit_status in ('reported', 'verified');
  end if;
  if new.status = 'closed' then
    update public.rma_units set unit_status = 'closed' where rma_id = new.id and unit_status not in ('rejected', 'credited', 'returned_to_client', 'closed');
  end if;
  return null;
end;
$$;
create trigger rmas_after_status
  after update of status on public.rmas
  for each row execute function public.rmas_after_status();
revoke execute on function public.rmas_after_status() from public, anon, authenticated;

-- Notifications: a submitted RMA → specialists + the account owner; verified → admins (to approve).
create function public.rmas_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record; v_units int;
begin
  if new.status = 'form_received' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select count(*) into v_units from public.rma_units where rma_id = new.id;
    for u in
      select distinct p.user_id from public.profiles p
       where p.active and (p.role = 'account_specialist'
          or exists (select 1 from public.account_assignments x
                      where x.account_id = new.account_id and x.user_id = p.user_id and x.role_on_account = 'owner'))
    loop
      perform public.notify_upsert(u.user_id, 'rma_received',
        'RMA received: ' || new.number || case when new.channel = 'portal' then ' (portal)' else '' end,
        v_units || ' unit' || case when v_units = 1 then '' else 's' end || ' to verify (IMEI check and evidence).',
        '/rmas/' || new.id);
    end loop;
  elsif tg_op = 'UPDATE' and new.status = 'verified' and old.status is distinct from new.status then
    for u in select p.user_id from public.profiles p where p.active and p.role = 'admin' loop
      perform public.notify_upsert(u.user_id, 'rma_to_approve', 'RMA to approve: ' || new.number,
        'Verified by the specialist; decide the resolution and the credit.', '/rmas/' || new.id);
    end loop;
  end if;
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    update public.notifications set read_at = now()
     where link = '/rmas/' || new.id and read_at is null
       and ((kind = 'rma_received' and new.status >= 'verified') or (kind = 'rma_to_approve' and new.status >= 'approved'));
  end if;
  return null;
end;
$$;
create trigger rmas_notify
  after insert or update of status on public.rmas
  for each row execute function public.rmas_notify();
revoke execute on function public.rmas_notify() from public, anon, authenticated;

-- Batch life: shipped → units shipped to HK; received → units received, cases received.
-- Units added to a batch → their case goes "In batch".
create function public.rma_units_after_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.batch_id is not null and new.batch_id is distinct from old.batch_id then
    update public.rmas set status = 'in_batch'
     where id = new.rma_id and status in ('approved', 'awaiting_return', 'credit_agreed');
  end if;
  return null;
end;
$$;
create trigger rma_units_after_batch
  after update of batch_id on public.rma_units
  for each row execute function public.rma_units_after_batch();
revoke execute on function public.rma_units_after_batch() from public, anon, authenticated;

create function public.rma_batches_after_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'shipped' and old.status = 'open' then
    update public.rma_units set unit_status = 'shipped_to_hk'
     where batch_id = new.id and unit_status in ('reported', 'verified', 'awaiting_shipment');
  elsif new.status = 'received' and old.status <> 'received' then
    update public.rma_units set unit_status = 'received_hk'
     where batch_id = new.id and unit_status in ('awaiting_shipment', 'shipped_to_hk');
    update public.rmas r set status = 'received_hk'
     where r.status = 'in_batch'
       and exists (select 1 from public.rma_units u where u.rma_id = r.id and u.batch_id = new.id)
       and not exists (select 1 from public.rma_units u where u.rma_id = r.id and u.resolution = 'return_hk'
                         and (u.batch_id is distinct from new.id));
  end if;
  return null;
end;
$$;
create trigger rma_batches_after_status
  after update of status on public.rma_batches
  for each row execute function public.rma_batches_after_status();
revoke execute on function public.rma_batches_after_status() from public, anon, authenticated;

create function public.rma_batches_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'shipped' and old.status = 'open' then
    if coalesce(new.awb, '') = '' then
      raise exception 'Enter the AWB before marking the batch shipped.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.rma_units where batch_id = new.id) then
      raise exception 'The batch has no units.' using errcode = '23514';
    end if;
    new.shipped_at := coalesce(new.shipped_at, now());
  end if;
  if new.status = 'received' then
    new.received_at := coalesce(new.received_at, now());
  end if;
  if new.status < old.status and (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Only an admin moves a batch back.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger rma_batches_before_update
  before update on public.rma_batches
  for each row execute function public.rma_batches_before_update();
revoke execute on function public.rma_batches_before_update() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Credit notes (P10): <code>-CN-NN; Draft → Approved (admin) → Issued → Applied
-- -----------------------------------------------------------------------------
create table public.credit_notes (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.accounts (id) on delete restrict,
  number              text not null default '',             -- <code>-CN-NN, set by trigger
  rma_id              uuid references public.rmas (id) on delete set null,
  order_id            uuid references public.orders (id) on delete set null,   -- the invoice it refers to
  invoice_no          text,
  in_favor_of         text,                                 -- client legal entity as on the invoice
  currency            public.currency_code not null default 'USD',
  amount              numeric(12, 2) not null default 0,    -- Σ lines (trigger)
  reason              text,
  applied_to          public.credit_applied_to not null default 'next_invoice',
  applied_order_id    uuid references public.orders (id) on delete set null,
  applied_invoice_no  text,
  status              public.credit_note_status not null default 'draft',
  approved_by         uuid,
  approved_at         timestamptz,
  issued_on           date,
  applied_on          date,
  pdf_file_id         uuid references public.files (id) on delete set null,
  xlsx_file_id        uuid references public.files (id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  unique (account_id, number)
);
create index credit_notes_account_idx on public.credit_notes (account_id);
create index credit_notes_rma_idx on public.credit_notes (rma_id);
select public.setup_table('public.credit_notes');

create table public.credit_note_lines (
  id              uuid primary key default gen_random_uuid(),
  credit_note_id  uuid not null references public.credit_notes (id) on delete cascade,
  account_id      uuid not null references public.accounts (id) on delete cascade,  -- copied for RLS
  description     text not null,
  qty             numeric(12, 2) not null default 1 check (qty > 0),
  unit_price      numeric(12, 2) not null check (unit_price >= 0),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now()
);
create index credit_note_lines_cn_idx on public.credit_note_lines (credit_note_id);
select public.setup_table('public.credit_note_lines');

create function public.credit_notes_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text; v_next int; v_admin boolean := public.is_admin(); v_system boolean := (select auth.uid()) is null;
begin
  if tg_op = 'INSERT' then
    if new.number is null or new.number = '' then
      perform pg_advisory_xact_lock(hashtext('credit_notes:' || new.account_id::text));
      select code into v_code from public.accounts where id = new.account_id;
      select coalesce(max(substring(number from '-CN-([0-9]+)$')::int), 0) + 1 into v_next
        from public.credit_notes where account_id = new.account_id;
      new.number := v_code || '-CN-' || lpad(v_next::text, 2, '0');
    end if;
    if not v_system then
      new.status := 'draft';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'approved' and not v_admin and not v_system then
      raise exception 'Only an admin (Sales Director) approves a credit note (SOP P10).' using errcode = '42501';
    end if;
    if new.status = 'issued' and old.status <> 'approved' and not v_system then
      raise exception 'A credit note is issued only after it is approved.' using errcode = '23514';
    end if;
    if new.status = 'applied' and old.status not in ('issued', 'approved') and not v_system then
      raise exception 'Only an issued credit note can be applied.' using errcode = '23514';
    end if;
    if new.status = 'applied' and coalesce(new.applied_invoice_no, '') = '' and new.applied_to <> 'refund' then
      raise exception 'Write the invoice number where the credit was applied.' using errcode = '23514';
    end if;
    if new.status < old.status and new.status <> 'cancelled' and not v_admin and not v_system then
      raise exception 'Only an admin moves a credit note back.' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and not v_admin and not v_system then
      raise exception 'Only an admin cancels a credit note.' using errcode = '42501';
    end if;
    if new.status = 'approved' then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
      new.approved_at := now();
      new.issued_on := coalesce(new.issued_on, current_date);   -- SOP: date of issue = the day the SD approves
    end if;
    if new.status = 'applied' then
      new.applied_on := coalesce(new.applied_on, current_date);
    end if;
  elsif old.status <> 'draft' and not v_admin and not v_system
        and (new.amount, new.currency, new.rma_id, new.order_id, new.invoice_no, new.in_favor_of)
            is distinct from (old.amount, old.currency, old.rma_id, old.order_id, old.invoice_no, old.in_favor_of) then
    raise exception 'The credit note is approved: only an admin changes it.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger credit_notes_before_write
  before insert or update on public.credit_notes
  for each row execute function public.credit_notes_before_write();
revoke execute on function public.credit_notes_before_write() from public, anon, authenticated;

-- Units of the RMA are "Credited" once the credit note is issued.
create function public.credit_notes_after_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rma_id is not null and new.status in ('issued', 'applied') and old.status not in ('issued', 'applied') then
    update public.rma_units set unit_status = 'credited'
     where rma_id = new.rma_id and resolution in ('repair_credit', 'credit_note')
       and unit_status not in ('closed', 'rejected');
    update public.rmas set status = 'credit_agreed'
     where id = new.rma_id and status in ('approved');
  end if;
  return null;
end;
$$;
create trigger credit_notes_after_status
  after update of status on public.credit_notes
  for each row execute function public.credit_notes_after_status();
revoke execute on function public.credit_notes_after_status() from public, anon, authenticated;

create function public.credit_note_lines_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.credit_note_status;
begin
  select c.account_id, c.status into new.account_id, v_status from public.credit_notes c where c.id = new.credit_note_id;
  if v_status <> 'draft' and (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Lines change only while the credit note is a draft.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger credit_note_lines_before_write
  before insert or update on public.credit_note_lines
  for each row execute function public.credit_note_lines_before_write();
revoke execute on function public.credit_note_lines_before_write() from public, anon, authenticated;

create function public.credit_note_lines_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cn uuid := coalesce(new.credit_note_id, old.credit_note_id);
  v_status public.credit_note_status;
begin
  if tg_op = 'DELETE' then
    select status into v_status from public.credit_notes where id = v_cn;
    if v_status is not null and v_status <> 'draft' and (select auth.uid()) is not null and not public.is_admin() then
      raise exception 'Lines change only while the credit note is a draft.' using errcode = '42501';
    end if;
  end if;
  update public.credit_notes
     set amount = coalesce((select sum(round(qty * unit_price, 2)) from public.credit_note_lines where credit_note_id = v_cn), 0)
   where id = v_cn;
  return null;
end;
$$;
create trigger credit_note_lines_after_change
  after insert or update or delete on public.credit_note_lines
  for each row execute function public.credit_note_lines_after_change();
revoke execute on function public.credit_note_lines_after_change() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Overview for the internal RMA list (RLS of the caller applies)
-- -----------------------------------------------------------------------------
create view public.rma_overview
with (security_invoker = true)
as
select r.id, r.account_id, r.number, r.status, r.channel, r.units_location, r.created_at, r.submitted_at,
       r.approved_at, r.closed_at, r.updated_at,
       a.code as account_code, a.name as account_name, a.market, a.intermediary_id,
       count(u.id)::int as units,
       count(u.id) filter (where u.imei_check = 'ours')::int as units_ours,
       count(u.id) filter (where u.imei_check = 'not_found')::int as units_not_found,
       count(u.id) filter (where u.resolution = 'pending')::int as units_pending,
       count(u.id) filter (where u.resolution = 'return_hk')::int as units_return,
       count(u.id) filter (where u.resolution = 'return_hk' and u.batch_id is null and u.unit_status in ('reported', 'verified', 'awaiting_shipment'))::int as units_to_batch,
       count(u.id) filter (where u.battery_swollen)::int as units_swollen,
       count(u.id) filter (where u.warranty_ok is false)::int as units_out_of_warranty,
       count(u.id) filter (where u.claimed_before is not null)::int as units_claimed_before,
       count(u.id) filter (where u.source = 'testing')::int as units_testing,
       count(u.id) filter (where not exists (select 1 from public.files f where f.rma_unit_id = u.id))::int as units_without_evidence,
       coalesce(sum(u.credit_usd), 0) as credit_usd,
       round(coalesce((select sum(o.total_usd) from public.orders o
                        where o.id in (select x.origin_order_id from public.rma_units x where x.rma_id = r.id)), 0)
             * public.setting_num('rma_credit_cap_pct', 1) / 100, 2) as cap_usd
  from public.rmas r
  join public.accounts a on a.id = r.account_id
  left join public.rma_units u on u.rma_id = r.id
 group by r.id, a.id;

-- -----------------------------------------------------------------------------
-- 7. Grants and RLS (staff)
-- -----------------------------------------------------------------------------
revoke all on public.portal_users, public.rma_batches, public.rmas, public.rma_units,
              public.credit_notes, public.credit_note_lines from anon;
revoke all on public.rma_overview from anon;
grant select, insert, update, delete on public.portal_users, public.rma_batches, public.rmas, public.rma_units,
  public.credit_notes, public.credit_note_lines to authenticated;
grant select on public.rma_overview to authenticated;
-- computed / automatic columns are never typed
revoke update on public.rmas from authenticated;
grant update (status, units_location, order_refs, contact_name, contact_info, client_notes, internal_notes)
  on public.rmas to authenticated;
revoke update on public.rma_units from authenticated;
grant update (imei, model, storage_gb, color, fault_category, fault_text, source, detected_on, battery_swollen,
              physical_damage, resolution, unit_status, unit_price_usd, credit_pct, credit_fixed_usd, batch_id,
              hkr_notes, sort_order)
  on public.rma_units to authenticated;
revoke update on public.credit_notes from authenticated;
grant update (rma_id, order_id, invoice_no, in_favor_of, currency, reason, applied_to, applied_order_id,
              applied_invoice_no, status, issued_on, applied_on, pdf_file_id, xlsx_file_id, notes)
  on public.credit_notes to authenticated;
revoke update on public.portal_users from authenticated;
grant update (contact_id, language, active) on public.portal_users to authenticated;

create policy portal_users_read on public.portal_users
  for select to authenticated using (public.has_account_access(account_id) or user_id = (select auth.uid()));
create policy portal_users_insert on public.portal_users
  for insert to authenticated with check (public.can_manage_portal(account_id));
create policy portal_users_update on public.portal_users
  for update to authenticated
  using (public.can_manage_portal(account_id)) with check (public.can_manage_portal(account_id));
create policy portal_users_admin_delete on public.portal_users
  for delete to authenticated using ((select public.is_admin()));

create policy rmas_read on public.rmas
  for select to authenticated using (public.has_account_access(account_id));
create policy rmas_insert on public.rmas
  for insert to authenticated with check (public.has_account_access(account_id));
create policy rmas_update on public.rmas
  for update to authenticated
  using (public.has_account_access(account_id)) with check (public.has_account_access(account_id));
create policy rmas_admin_delete on public.rmas
  for delete to authenticated using ((select public.is_admin()));

create policy rma_units_read on public.rma_units
  for select to authenticated using (public.has_account_access(account_id));
create policy rma_units_insert on public.rma_units
  for insert to authenticated
  with check (exists (select 1 from public.rmas r where r.id = rma_id and public.has_account_access(r.account_id)));
create policy rma_units_update on public.rma_units
  for update to authenticated
  using (public.has_account_access(account_id)) with check (public.has_account_access(account_id));
create policy rma_units_delete on public.rma_units
  for delete to authenticated
  using ((select public.is_admin())
         or (public.has_account_access(account_id)
             and exists (select 1 from public.rmas r where r.id = rma_id and r.status < 'approved')));

-- batches mix several clients: admin + account specialists only (the SOP P11 owners)
create policy rma_batches_read on public.rma_batches
  for select to authenticated using ((select public.current_app_role()) in ('admin', 'account_specialist'));
create policy rma_batches_insert on public.rma_batches
  for insert to authenticated with check ((select public.current_app_role()) in ('admin', 'account_specialist'));
create policy rma_batches_update on public.rma_batches
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'account_specialist'))
  with check ((select public.current_app_role()) in ('admin', 'account_specialist'));
create policy rma_batches_admin_delete on public.rma_batches
  for delete to authenticated using ((select public.is_admin()) and status = 'open');

create policy credit_notes_read on public.credit_notes
  for select to authenticated using (public.has_account_access(account_id));
create policy credit_notes_insert on public.credit_notes
  for insert to authenticated with check (public.has_account_access(account_id));
create policy credit_notes_update on public.credit_notes
  for update to authenticated
  using (public.has_account_access(account_id)) with check (public.has_account_access(account_id));
create policy credit_notes_delete on public.credit_notes
  for delete to authenticated
  using ((select public.is_admin()) or (public.has_account_access(account_id) and status = 'draft'));

create policy credit_note_lines_read on public.credit_note_lines
  for select to authenticated using (public.has_account_access(account_id));
create policy credit_note_lines_insert on public.credit_note_lines
  for insert to authenticated
  with check (exists (select 1 from public.credit_notes c where c.id = credit_note_id and public.has_account_access(c.account_id)));
create policy credit_note_lines_update on public.credit_note_lines
  for update to authenticated
  using (public.has_account_access(account_id)) with check (public.has_account_access(account_id));
create policy credit_note_lines_delete on public.credit_note_lines
  for delete to authenticated using (public.has_account_access(account_id));

alter publication supabase_realtime add table public.rmas, public.rma_units;

-- -----------------------------------------------------------------------------
-- 8. Client portal: read-only views, filtered to the client's own account.
--    These views run as their owner on purpose (no security_invoker): the base tables
--    stay closed to clients, and each view exposes only client-safe columns of
--    rows where account_id = portal_account_id() (null → no rows for everyone else).
-- -----------------------------------------------------------------------------
-- File kinds a client may open: invoices, IMEI list, trackings, delivery proof, credit notes,
-- and the RMA form/evidence. Never payment proofs checked internally, labels or VERIF.
create function public.portal_file_kind_visible(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind in ('INV-HK', 'INV-EU', 'IMEI', 'TRK-HK', 'TRK-EU', 'TRK', 'POD', 'CN', 'FORM', 'PRUEBAS');
$$;
grant execute on function public.portal_file_kind_visible(text) to authenticated;

create view public.portal_account as
select a.id, a.code, a.name, a.legal_name, a.country, a.market, a.currency, a.payment_method, a.language,
       i.name as intermediary_name
  from public.accounts a left join public.intermediaries i on i.id = a.intermediary_id
 where a.id = public.portal_account_id();

-- (computed here from the base tables: order_overview is security_invoker and would apply the
--  client's own RLS, which hides every order)
create view public.portal_orders as
with p as (
  select o.*, coalesce(o.partner_invoice_eur, o.total_usd) as payable,
         coalesce((select sum(x.amount) from public.payments x
                    where x.order_id = o.id and x.type = 'deposit' and x.status = 'confirmed'), 0) as dep_ok,
         coalesce((select sum(x.amount) from public.payments x
                    where x.order_id = o.id and x.type = 'balance' and x.status = 'confirmed'), 0) as bal_ok
    from public.orders o
   where o.account_id = public.portal_account_id() and o.status <> 'quoted'
)
select p.id, p.number, p.status, p.order_date, p.pieces, p.total_usd,
       (p.partner_invoice_eur is not null) as pays_in_eur, p.payable as payable_total,
       round(p.payable * public.setting_num('deposit_pct', 10) / 100, 2) as deposit_payable,
       p.dep_ok as deposit_confirmed, p.bal_ok as balance_confirmed,
       case when p.status >= 'balance_paid' then 0 else greatest(p.payable - p.dep_ok - p.bal_ok, 0) end as balance_pending,
       exists (select 1 from public.payments x where x.order_id = p.id and x.status = 'awaiting_confirmation') as payment_awaiting,
       (select count(*) from public.imei_master i where i.order_id = p.id)::int as imei_count,
       p.hk_invoice_no, p.partner_invoice_no, p.partner_invoice_eur, p.payment_method, p.eta_date, p.ship_date,
       p.courier, p.tracking, p.delivered_date, p.freight_usd, p.customs_usd, p.rma_discount_usd, p.usdt_fee_usd,
       p.battery_line_usd, p.subtotal_usd
  from p;

create view public.portal_order_lines as
select l.order_id, coalesce(s.model || ' ' || s.storage_gb || 'GB ' || s.color, l.description) as item,
       s.model, s.storage_gb, s.color, l.qty, l.unit_price_usd, l.battery_new, l.sort_order
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  left join public.skus s on s.id = l.sku_id
 where l.account_id = public.portal_account_id() and o.status <> 'quoted';

create view public.portal_imeis as
select i.imei, i.order_id, o.number as order_number, s.model, s.storage_gb, s.color, i.shipped_at
  from public.imei_master i
  join public.orders o on o.id = i.order_id
  left join public.skus s on s.id = i.sku_id
 where i.account_id = public.portal_account_id() and o.status >= 'shipped';

create view public.portal_files as
select f.id, f.owner_table, f.owner_id, f.rma_unit_id, f.kind::text as kind, f.file_name, f.mime_type, f.size_bytes,
       f.created_at, f.storage_path
  from public.files f
 where f.account_id = public.portal_account_id() and public.portal_file_kind_visible(f.kind::text)
   and (f.owner_table <> 'credit_notes'
        or exists (select 1 from public.credit_notes c where c.id = f.owner_id and c.status in ('issued', 'applied')));

create view public.portal_rmas as
select r.id, r.number, r.status, r.channel, r.units_location, r.order_refs, r.client_notes, r.created_at,
       r.submitted_at, r.approved_at, r.closed_at,
       (select count(*) from public.rma_units u where u.rma_id = r.id)::int as units,
       (select count(*) from public.rma_units u where u.rma_id = r.id
         and not exists (select 1 from public.files f where f.rma_unit_id = u.id))::int as units_without_evidence,
       case when r.status >= 'approved' then (select coalesce(sum(u.credit_usd), 0) from public.rma_units u where u.rma_id = r.id) end as credit_usd
  from public.rmas r
 where r.account_id = public.portal_account_id();

create view public.portal_rma_units as
select u.id, u.rma_id, u.imei, u.model, u.storage_gb, u.color, u.fault_category, u.fault_text, u.source,
       u.detected_on, u.battery_swollen, u.physical_damage,
       (u.imei_check = 'ours') as imei_found,                 -- never says WHOSE an IMEI is
       u.warranty_ok,
       case when r.status >= 'approved' then u.resolution end as resolution,
       u.unit_status,
       case when r.status >= 'approved' then u.credit_usd end as credit_usd,
       (select count(*) from public.files f where f.rma_unit_id = u.id)::int as evidence_count,
       u.sort_order
  from public.rma_units u join public.rmas r on r.id = u.rma_id
 where u.account_id = public.portal_account_id();

create view public.portal_credit_notes as
select c.id, c.number, c.rma_id, r.number as rma_number, c.invoice_no, c.currency, c.amount, c.applied_to,
       c.applied_invoice_no, c.status, c.issued_on, c.applied_on, c.pdf_file_id
  from public.credit_notes c left join public.rmas r on r.id = c.rma_id
 where c.account_id = public.portal_account_id() and c.status in ('issued', 'applied');

revoke all on public.portal_account, public.portal_orders, public.portal_order_lines, public.portal_imeis,
              public.portal_files, public.portal_rmas, public.portal_rma_units, public.portal_credit_notes
  from anon, public;
grant select on public.portal_account, public.portal_orders, public.portal_order_lines, public.portal_imeis,
                public.portal_files, public.portal_rmas, public.portal_rma_units, public.portal_credit_notes
  to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Client portal: the only write paths (security definer, checked here)
-- -----------------------------------------------------------------------------
-- Live IMEI check while the client types. Answers only about the client's own shipments:
-- an IMEI of another client looks exactly like an unknown IMEI.
create function public.portal_check_imei(p_imei text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acc uuid := public.portal_account_id();
  m record; v_ref date; v_months int := public.setting_num('warranty_months', 12)::int;
  v_prev text;
begin
  if v_acc is null then
    raise exception 'No portal access.' using errcode = '42501';
  end if;
  if p_imei !~ '^[0-9]{15}$' then
    return jsonb_build_object('valid', false, 'found', false);
  end if;
  select i.shipped_at, o.ship_date, o.delivered_date, o.number, s.model, s.storage_gb, s.color into m
    from public.imei_master i
    left join public.orders o on o.id = i.order_id
    left join public.skus s on s.id = i.sku_id
   where i.imei = p_imei and i.account_id = v_acc;
  if not found then
    return jsonb_build_object('valid', true, 'found', false);
  end if;
  v_ref := coalesce(m.delivered_date, m.shipped_at, m.ship_date);
  select r.number into v_prev from public.rma_units u join public.rmas r on r.id = u.rma_id
   where u.imei = p_imei and u.account_id = v_acc order by r.created_at desc limit 1;
  return jsonb_build_object('valid', true, 'found', true, 'order', m.number, 'model', m.model,
    'storage_gb', m.storage_gb, 'color', m.color, 'shipped_on', coalesce(m.shipped_at, m.ship_date),
    'warranty_until', case when v_ref is not null then (v_ref + make_interval(months => v_months))::date end,
    'warranty_ok', case when v_ref is not null then current_date <= (v_ref + make_interval(months => v_months))::date end,
    'claimed_before', v_prev);
end;
$$;
revoke execute on function public.portal_check_imei(text) from public, anon;
grant execute on function public.portal_check_imei(text) to authenticated;

-- Creates the RMA (status Requested) with its units. Evidence is uploaded next, then
-- portal_submit_rma moves it to Form received. p_units: [{imei, model, storage_gb, color,
-- fault_category, fault_text, source, detected_on, battery_swollen, physical_damage}]
create function public.portal_create_rma(p_units jsonb, p_location text, p_order_refs text,
                                         p_contact_name text, p_contact_info text, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc uuid := public.portal_account_id();
  v_rma uuid; v_number text; u jsonb; v_i int := 0; v_ids jsonb := '[]';
  v_unit uuid;
begin
  if v_acc is null then
    raise exception 'No portal access.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) = 0 then
    raise exception 'Add at least one unit.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_units) > 200 then
    raise exception 'At most 200 units per request.' using errcode = '23514';
  end if;
  insert into public.rmas (account_id, channel, units_location, order_refs, contact_name, contact_info, client_notes)
  values (v_acc, 'portal', nullif(p_location, '')::public.units_location, left(p_order_refs, 500),
          left(p_contact_name, 200), left(p_contact_info, 200), left(p_notes, 2000))
  returning id, number into v_rma, v_number;
  for u in select * from jsonb_array_elements(p_units) loop
    v_i := v_i + 1;
    insert into public.rma_units (rma_id, account_id, imei, model, storage_gb, color, fault_category, fault_text,
                                  source, detected_on, battery_swollen, physical_damage, sort_order)
    values (v_rma, v_acc, u ->> 'imei', left(nullif(u ->> 'model', ''), 60),
            nullif(u ->> 'storage_gb', '')::int, left(nullif(u ->> 'color', ''), 40),
            u ->> 'fault_category', left(u ->> 'fault_text', 1000),
            coalesce(nullif(u ->> 'source', ''), 'testing')::public.rma_source,
            nullif(u ->> 'detected_on', '')::date,
            coalesce((u ->> 'battery_swollen')::boolean, false), coalesce((u ->> 'physical_damage')::boolean, false),
            v_i)
    returning id into v_unit;
    v_ids := v_ids || jsonb_build_object('id', v_unit, 'imei', u ->> 'imei');
  end loop;
  return jsonb_build_object('id', v_rma, 'number', v_number, 'units', v_ids);
end;
$$;
revoke execute on function public.portal_create_rma(jsonb, text, text, text, text, text) from public, anon;
grant execute on function public.portal_create_rma(jsonb, text, text, text, text, text) to authenticated;

-- Registers one uploaded evidence file (photo / video) for a unit of the client's own RMA.
create function public.portal_add_evidence(p_unit uuid, p_path text, p_name text, p_mime text, p_size bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc uuid := public.portal_account_id();
  v_rma record; v_id uuid;
begin
  if v_acc is null then
    raise exception 'No portal access.' using errcode = '42501';
  end if;
  select r.id, r.number, r.status into v_rma
    from public.rma_units u join public.rmas r on r.id = u.rma_id
   where u.id = p_unit and u.account_id = v_acc;
  if not found then
    raise exception 'Unit not found.' using errcode = '42501';
  end if;
  if v_rma.status > 'verified' then
    raise exception 'This RMA is already decided; send new evidence to your account specialist.' using errcode = '23514';
  end if;
  if p_path not like (v_acc::text || '/rmas/RMA-' || split_part(v_rma.number, '-RMA-', 2) || '/%') then
    raise exception 'Wrong storage folder.' using errcode = '42501';
  end if;
  if coalesce(p_mime, '') !~ '^(image|video)/' and coalesce(p_mime, '') <> 'application/pdf' then
    raise exception 'Evidence must be a photo, a video or a PDF.' using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'account-files' and o.name = p_path) then
    raise exception 'The file was not uploaded.' using errcode = '23514';
  end if;
  insert into public.files (account_id, owner_table, owner_id, rma_unit_id, kind, storage_path, file_name, mime_type, size_bytes)
  values (v_acc, 'rmas', v_rma.id, p_unit, 'PRUEBAS', p_path, left(p_name, 200), p_mime, p_size)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.portal_add_evidence(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.portal_add_evidence(uuid, text, text, text, bigint) to authenticated;

-- Form + evidence complete → Form received (SOP P6: without form, IMEIs or evidence it stays Requested).
create function public.portal_submit_rma(p_rma uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc uuid := public.portal_account_id();
  v_missing jsonb;
  v_status public.rma_status;
begin
  if v_acc is null then
    raise exception 'No portal access.' using errcode = '42501';
  end if;
  select status into v_status from public.rmas where id = p_rma and account_id = v_acc;
  if not found then
    raise exception 'RMA not found.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(u.imei order by u.sort_order), '[]') into v_missing
    from public.rma_units u
   where u.rma_id = p_rma and not exists (select 1 from public.files f where f.rma_unit_id = u.id);
  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'missing_evidence', v_missing);
  end if;
  if v_status = 'requested' then
    update public.rmas set status = 'form_received' where id = p_rma;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.portal_submit_rma(uuid) from public, anon;
grant execute on function public.portal_submit_rma(uuid) to authenticated;

-- Last login, for the account's Portal tab.
create function public.portal_touch()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.portal_users set last_login_at = now()
   where user_id = (select auth.uid()) and active
     and (last_login_at is null or last_login_at < now() - interval '10 minutes');
$$;
revoke execute on function public.portal_touch() from public, anon;
grant execute on function public.portal_touch() to authenticated;

-- Storage for clients: upload evidence only into <their account>/rmas/RMA-NN/ and read only
-- the files the portal shows (portal_files).
create function public.portal_storage_can_upload(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acc uuid := public.portal_account_id();
  v_folder text := split_part(p_name, '/', 3);
begin
  if v_acc is null or split_part(p_name, '/', 1) <> v_acc::text or split_part(p_name, '/', 2) <> 'rmas' then
    return false;
  end if;
  return exists (select 1 from public.rmas r
                  where r.account_id = v_acc and r.status <= 'verified'
                    and 'RMA-' || split_part(r.number, '-RMA-', 2) = v_folder);
end;
$$;
revoke execute on function public.portal_storage_can_upload(text) from public, anon;
grant execute on function public.portal_storage_can_upload(text) to authenticated;

create function public.portal_storage_can_read(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.portal_files f where f.storage_path = p_name);
$$;
revoke execute on function public.portal_storage_can_read(text) from public, anon;
grant execute on function public.portal_storage_can_read(text) to authenticated;

create policy portal_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'account-files' and public.portal_storage_can_upload(name));
create policy portal_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'account-files' and public.portal_storage_can_read(name));

-- Batch documents (the courier label of a consolidated shipment mixes several clients):
-- account-files/batches/<batch id>/…, admin and account specialists only.
create policy batch_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'account-files' and split_part(name, '/', 1) = 'batches'
         and (select public.current_app_role()) in ('admin', 'account_specialist'));
create policy batch_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'account-files' and split_part(name, '/', 1) = 'batches'
              and (select public.current_app_role()) in ('admin', 'account_specialist'));
create policy batch_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'account-files' and split_part(name, '/', 1) = 'batches'
         and (select public.current_app_role()) in ('admin', 'account_specialist'));
