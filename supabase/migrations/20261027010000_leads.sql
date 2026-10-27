-- =============================================================================
-- HKR System — Phase 1: leads, timeline, public form submissions, imports, Brevo
-- Brief §7 (leads, lead_form_submissions, scoring_rules), §8 (Leads: admin + bd all,
-- account_specialist read), §9 (Brevo).
-- Adds tables only; does not change or delete existing data.
-- =============================================================================

create type public.lead_stage as enum
  ('New', 'Contacted', 'Replied', 'Qualified', 'Meeting', 'Sample/Proposal', 'Won', 'Lost');
create type public.lead_tier as enum ('A', 'B', 'C');
create type public.lead_event_kind as enum
  ('created', 'stage_change', 'owner_change', 'note', 'contact', 'form', 'import', 'email', 'whatsapp', 'brevo');

-- admin and bd work leads; account_specialist only reads them (brief §8).
create function public.can_work_leads()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'bd'), false);
$$;
revoke execute on function public.can_work_leads() from public, anon;
grant execute on function public.can_work_leads() to authenticated;

-- -----------------------------------------------------------------------------
-- Import batches (so an import can be undone)
-- -----------------------------------------------------------------------------
create table public.lead_import_batches (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  file_name     text,
  rows_total    integer not null default 0,
  rows_created  integer not null default 0,
  rows_merged   integer not null default 0,
  rows_skipped  integer not null default 0,
  undone_at     timestamptz,
  undone_by     uuid,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now()
);
select public.setup_table('public.lead_import_batches');

-- -----------------------------------------------------------------------------
-- Leads
-- -----------------------------------------------------------------------------
create table public.leads (
  id                  uuid primary key default gen_random_uuid(),
  company             text not null check (length(trim(company)) > 0),
  country             text check (country ~ '^[A-Z]{2}$'),          -- ISO 3166-1 alpha-2
  city                text,
  market              public.market,
  source              text not null default 'manual',
  contact_name        text,
  title               text,
  phone_e164          text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email               text check (email = lower(email) and position('@' in email) > 1),
  website             text,
  linkedin_url        text,
  business_type       text,
  sells_iphones       boolean,
  sells_refurbished   boolean,
  volume_units_month  integer check (volume_units_month >= 0),
  volume_range        text,
  heard_about         text,
  score               integer not null default 0,
  tier                public.lead_tier,
  disqualified        boolean not null default false,
  disqualify_reason   text,
  stage               public.lead_stage not null default 'New',
  stage_changed_at    timestamptz not null default now(),
  owner_user_id       uuid references public.profiles (user_id) on delete set null,
  next_action         text,
  next_action_date    date,
  last_touch_at       timestamptz,
  language            text not null default 'en' check (language in ('en', 'es')),
  brevo_contact_id    bigint,
  brevo_list          text,
  brevo_synced_at     timestamptz,
  email_opt_out       boolean not null default false,
  whatsapp_opt_in     boolean not null default false,
  lost_reason         text,
  import_batch_id     uuid references public.lead_import_batches (id) on delete set null,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  constraint leads_lost_needs_reason check (stage <> 'Lost' or length(trim(coalesce(lost_reason, ''))) > 0)
);
-- One lead per email and per phone: the form and the importer merge into it.
create unique index leads_email_key on public.leads (email) where email is not null;
create unique index leads_phone_key on public.leads (phone_e164) where phone_e164 is not null;
create index leads_stage_idx on public.leads (stage);
create index leads_owner_idx on public.leads (owner_user_id);
create index leads_next_action_idx on public.leads (next_action_date);
create index leads_import_batch_idx on public.leads (import_batch_id);
select public.setup_table('public.leads');

-- -----------------------------------------------------------------------------
-- Timeline
-- -----------------------------------------------------------------------------
create table public.lead_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  kind        public.lead_event_kind not null,
  body        text,
  data        jsonb,
  user_id     uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
create index lead_events_lead_idx on public.lead_events (lead_id, created_at desc);
select public.setup_table('public.lead_events');

-- Stage and owner changes are written to the timeline by the database itself, so
-- every path (list, Kanban, API) is covered.
create function public.leads_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage <> 'Lost' then
      new.lost_reason := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger leads_before_update
  before update on public.leads
  for each row execute function public.leads_before_update();

create function public.leads_log_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_events (lead_id, kind, body, data, user_id)
    values (new.id, 'created', 'Lead created (source: ' || new.source || ')',
            jsonb_build_object('stage', new.stage, 'source', new.source), auth.uid());
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into public.lead_events (lead_id, kind, body, data, user_id)
    values (new.id, 'stage_change',
            old.stage || ' → ' || new.stage || coalesce(' (' || new.lost_reason || ')', ''),
            jsonb_build_object('from', old.stage, 'to', new.stage), auth.uid());
  end if;
  if new.owner_user_id is distinct from old.owner_user_id then
    insert into public.lead_events (lead_id, kind, body, data, user_id)
    values (new.id, 'owner_change',
            'Owner: ' || coalesce((select full_name from public.profiles where user_id = old.owner_user_id), 'none')
              || ' → ' || coalesce((select full_name from public.profiles where user_id = new.owner_user_id), 'none'),
            jsonb_build_object('from', old.owner_user_id, 'to', new.owner_user_id), auth.uid());
  end if;
  return new;
end;
$$;
create trigger leads_log_changes
  after insert or update on public.leads
  for each row execute function public.leads_log_changes();

revoke execute on function public.leads_before_update() from public, anon, authenticated;
revoke execute on function public.leads_log_changes() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Public form submissions (written by the server with the secret key)
-- -----------------------------------------------------------------------------
create table public.lead_form_submissions (
  id              uuid primary key default gen_random_uuid(),
  raw             jsonb not null,
  computed_score  integer not null default 0,
  tier            public.lead_tier,
  disqualified    boolean not null default false,
  lead_id         uuid references public.leads (id) on delete set null,
  merged          boolean not null default false,
  ip              text,
  user_agent      text,
  submitted_at    timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now()
);
create index lead_form_submissions_ip_idx on public.lead_form_submissions (ip, submitted_at desc);
create index lead_form_submissions_review_idx on public.lead_form_submissions (reviewed_at, submitted_at desc);
select public.setup_table('public.lead_form_submissions');

-- -----------------------------------------------------------------------------
-- Brevo list ids (cache of lists the app created in Brevo)
-- -----------------------------------------------------------------------------
create table public.brevo_lists (
  name           text primary key,
  brevo_list_id  bigint not null unique,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now()
);
select public.setup_table('public.brevo_lists', 'name');

-- -----------------------------------------------------------------------------
-- Undo an import: removes the leads that batch CREATED and that nobody has
-- touched since (still New, no notes/contacts/stage changes). Merged leads keep
-- their new data. Returns how many were removed and how many were kept.
-- -----------------------------------------------------------------------------
create function public.undo_lead_import(p_batch_id uuid)
returns table (removed integer, kept integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer := 0;
  v_total integer := 0;
begin
  if not public.can_work_leads() then
    raise exception 'Not allowed';
  end if;
  if exists (select 1 from public.lead_import_batches where id = p_batch_id and undone_at is not null) then
    raise exception 'This import was already undone';
  end if;

  select count(*) into v_total from public.leads where import_batch_id = p_batch_id;

  with untouched as (
    select l.id
      from public.leads l
     where l.import_batch_id = p_batch_id
       and l.stage = 'New'
       and not exists (
         select 1 from public.lead_events e
          where e.lead_id = l.id
            and e.kind not in ('created', 'import'))
  ), deleted as (
    delete from public.leads l using untouched u where l.id = u.id returning 1
  )
  select count(*) into v_removed from deleted;

  update public.lead_import_batches
     set undone_at = now(), undone_by = auth.uid()
   where id = p_batch_id;

  return query select v_removed, v_total - v_removed;
end;
$$;
revoke execute on function public.undo_lead_import(uuid) from public, anon;
grant execute on function public.undo_lead_import(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Grants and RLS
-- -----------------------------------------------------------------------------
revoke all on public.leads, public.lead_events, public.lead_form_submissions,
              public.lead_import_batches, public.brevo_lists from anon;

grant select, insert, update, delete on public.leads to authenticated;
grant select, insert on public.lead_events to authenticated;
grant select, update on public.lead_form_submissions to authenticated;
grant select, insert, update on public.lead_import_batches to authenticated;
grant select on public.brevo_lists to authenticated;

create policy leads_read on public.leads
  for select to authenticated using ((select public.is_staff()));
create policy leads_insert on public.leads
  for insert to authenticated with check ((select public.can_work_leads()));
create policy leads_update on public.leads
  for update to authenticated
  using ((select public.can_work_leads())) with check ((select public.can_work_leads()));
create policy leads_admin_delete on public.leads
  for delete to authenticated using ((select public.is_admin()));

create policy lead_events_read on public.lead_events
  for select to authenticated using ((select public.is_staff()));
create policy lead_events_insert on public.lead_events
  for insert to authenticated
  with check ((select public.can_work_leads()) and kind in ('note', 'contact', 'form', 'import', 'email', 'whatsapp', 'brevo'));

create policy lead_form_submissions_read on public.lead_form_submissions
  for select to authenticated using ((select public.can_work_leads()));
create policy lead_form_submissions_update on public.lead_form_submissions
  for update to authenticated
  using ((select public.can_work_leads())) with check ((select public.can_work_leads()));

create policy lead_import_batches_read on public.lead_import_batches
  for select to authenticated using ((select public.can_work_leads()));
create policy lead_import_batches_insert on public.lead_import_batches
  for insert to authenticated with check ((select public.can_work_leads()));
create policy lead_import_batches_update on public.lead_import_batches
  for update to authenticated
  using ((select public.can_work_leads())) with check ((select public.can_work_leads()));

create policy brevo_lists_admin_read on public.brevo_lists
  for select to authenticated using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- New settings (decided by Gabriel, Oct 2026)
-- -----------------------------------------------------------------------------
insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('lead_owner_by_market', 'leads', 'Lead owner per market',
   '{"EU": null, "LATAM": null, "US": null, "ROW": null}', false, 320,
   'Owner given to new form leads of each market. Empty = no automatic owner (decided Oct 2026); new submissions show in everyone''s My day.'),
  ('brevo_unsubscribes_synced_at', 'system', 'Last Brevo unsubscribe sync', 'null', false, 900,
   'Written by the nightly job.')
on conflict (key) do nothing;
