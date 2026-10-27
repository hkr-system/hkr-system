-- =============================================================================
-- HKR System — Phase 2: WhatsApp (Meta Cloud API direct) + in-app notifications
-- Brief §7 (wa_* tables), §8 (inbox visibility, broadcasts), §9 (Meta rules).
-- Decisions (Gabriel, Oct 2026):
--   * conversations with no assignee are visible to every bd and account_specialist
--   * owner of a lead that reaches Qualified is notified in the app AND by email
--   * number per market lives in settings (LATAM → US number, EU incl. UK → European numbers)
-- Adds tables only; does not change or delete existing data.
-- =============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create type public.wa_direction as enum ('inbound', 'outbound');
create type public.wa_message_status as enum ('received', 'queued', 'sent', 'delivered', 'read', 'failed');
create type public.wa_conversation_status as enum ('open', 'pending', 'resolved');
create type public.wa_cost_category as enum ('service', 'utility', 'marketing', 'authentication', 'none');
create type public.wa_broadcast_status as enum
  ('draft', 'pending_approval', 'approved', 'sending', 'done', 'cancelled', 'paused');
create type public.wa_recipient_status as enum ('queued', 'sent', 'delivered', 'read', 'failed', 'skipped');

-- -----------------------------------------------------------------------------
-- Numbers
-- -----------------------------------------------------------------------------
create table public.wa_numbers (
  id                     uuid primary key default gen_random_uuid(),
  phone_number_id        text not null unique,          -- Meta's id of the number
  display_phone          text not null,
  label                  text,                          -- HK-1 / HK-2 / US / NL / Test
  market                 public.market,
  verified_name          text,
  quality_rating         text,                          -- GREEN / YELLOW / RED / NA / UNKNOWN
  messaging_tier         text,                          -- TIER_250, TIER_1K…
  quality_checked_at     timestamptz,
  broadcasts_paused      boolean not null default false,
  paused_reason          text,
  daily_broadcast_limit  integer not null default 200 check (daily_broadcast_limit >= 0),
  is_demo                boolean not null default false, -- seeded fake numbers: never call Meta
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  created_by             uuid,
  updated_at             timestamptz not null default now()
);
select public.setup_table('public.wa_numbers');

-- -----------------------------------------------------------------------------
-- Conversations and messages
-- -----------------------------------------------------------------------------
create table public.wa_conversations (
  id                uuid primary key default gen_random_uuid(),
  wa_number_id      uuid not null references public.wa_numbers (id),
  contact_phone     text not null check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  contact_name      text,
  lead_id           uuid references public.leads (id) on delete set null,
  account_id        uuid references public.accounts (id) on delete set null,  -- used from Phase 3
  assigned_user_id  uuid references public.profiles (user_id) on delete set null,
  status            public.wa_conversation_status not null default 'open',
  last_inbound_at   timestamptz,
  last_outbound_at  timestamptz,
  last_message_at   timestamptz,
  last_message_preview text,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  unique (wa_number_id, contact_phone)
);
create index wa_conversations_last_idx on public.wa_conversations (last_message_at desc nulls last);
create index wa_conversations_lead_idx on public.wa_conversations (lead_id);
select public.setup_table('public.wa_conversations');

create table public.wa_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.wa_conversations (id) on delete cascade,
  direction        public.wa_direction not null,
  type             text not null,                 -- text, template, image, document, audio, video, button, interactive, …
  body             text,
  template_name    text,
  template_language text,
  media_id         text,                          -- Meta media id
  media_mime       text,
  media_filename   text,
  media_path       text,                          -- Storage path once downloaded/uploaded
  meta_message_id  text unique,                   -- wamid… (idempotency key)
  status           public.wa_message_status not null,
  error_code       text,
  error_title      text,
  cost_category    public.wa_cost_category not null default 'none',
  sent_by          uuid,
  broadcast_id     uuid,
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  meta_timestamp   timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now()
);
create index wa_messages_conversation_idx on public.wa_messages (conversation_id, created_at);
select public.setup_table('public.wa_messages');

-- Raw webhook deliveries (debugging; admin only). Not audited: it is itself a log.
create table public.wa_webhook_events (
  id           bigint generated always as identity primary key,
  payload      jsonb not null,
  error        text,
  received_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now()
);
select public.setup_table('public.wa_webhook_events');

-- -----------------------------------------------------------------------------
-- Templates (synced from Meta, read-only in the app)
-- -----------------------------------------------------------------------------
create table public.wa_templates (
  id          uuid primary key default gen_random_uuid(),
  meta_id     text,
  name        text not null,
  language    text not null,
  category    text not null,             -- MARKETING / UTILITY / AUTHENTICATION
  status      text not null,             -- APPROVED / PENDING / REJECTED / PAUSED / DISABLED
  components  jsonb not null default '[]',
  synced_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  unique (name, language)
);
select public.setup_table('public.wa_templates');

-- -----------------------------------------------------------------------------
-- Broadcasts
-- -----------------------------------------------------------------------------
create table public.wa_broadcasts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  wa_number_id    uuid not null references public.wa_numbers (id),
  template_id     uuid not null references public.wa_templates (id),
  segment         jsonb not null default '{}',     -- {tiers:[], markets:[], stages:[]}
  variables       jsonb not null default '[]',     -- [{source: "text"|"company"|"first_name", value}]
  header_media_id text,                            -- Meta media id for document/image headers
  header_filename text,
  scheduled_at    timestamptz,
  status          public.wa_broadcast_status not null default 'draft',
  approved_by     uuid,
  approved_at     timestamptz,
  count_queued    integer not null default 0,
  count_sent      integer not null default 0,
  count_delivered integer not null default 0,
  count_read      integer not null default 0,
  count_failed    integer not null default 0,
  count_skipped   integer not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now()
);
select public.setup_table('public.wa_broadcasts');

create table public.wa_broadcast_recipients (
  id              uuid primary key default gen_random_uuid(),
  broadcast_id    uuid not null references public.wa_broadcasts (id) on delete cascade,
  lead_id         uuid references public.leads (id) on delete set null,
  phone           text not null,
  status          public.wa_recipient_status not null default 'queued',
  skip_reason     text,
  message_id      uuid references public.wa_messages (id) on delete set null,
  error_title     text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  unique (broadcast_id, phone)
);
create index wa_broadcast_recipients_queue_idx on public.wa_broadcast_recipients (status, broadcast_id);
select public.setup_table('public.wa_broadcast_recipients');

alter table public.wa_messages
  add constraint wa_messages_broadcast_fk foreign key (broadcast_id) references public.wa_broadcasts (id) on delete set null;

-- -----------------------------------------------------------------------------
-- In-app notifications (bell in the header)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (user_id) on delete cascade,
  kind        text not null,              -- lead_qualified, wa_assigned, …
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);
select public.setup_table('public.notifications');

-- -----------------------------------------------------------------------------
-- Visibility helper (brief §8 + decision: unassigned conversations visible to all)
--   admin → all; bd / account_specialist → assigned to them, unassigned, or linked
--   to an account they can access (Phase 3).
-- -----------------------------------------------------------------------------
create function public.can_see_conversation(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wa_conversations c
     where c.id = p_id
       and public.is_staff()
       and (
         public.is_admin()
         or c.assigned_user_id is null
         or c.assigned_user_id = (select auth.uid())
         or (c.account_id is not null and public.has_account_access(c.account_id))
       ));
$$;
revoke execute on function public.can_see_conversation(uuid) from public, anon;
grant execute on function public.can_see_conversation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Keep the conversation summary and the lead timeline in step with messages
-- -----------------------------------------------------------------------------
create function public.wa_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead uuid;
  v_preview text := left(coalesce(new.body, case when new.template_name is not null then '[template] ' || new.template_name else '[' || new.type || ']' end), 160);
begin
  update public.wa_conversations c
     set last_message_at = coalesce(new.meta_timestamp, now()),
         last_message_preview = v_preview,
         last_inbound_at = case when new.direction = 'inbound' then coalesce(new.meta_timestamp, now()) else c.last_inbound_at end,
         last_outbound_at = case when new.direction = 'outbound' then coalesce(new.meta_timestamp, now()) else c.last_outbound_at end,
         status = case when new.direction = 'inbound' and c.status = 'resolved' then 'open' else c.status end
   where c.id = new.conversation_id
   returning c.lead_id into v_lead;

  if v_lead is not null then
    insert into public.lead_events (lead_id, kind, body, data, user_id)
    values (v_lead, 'whatsapp',
            case when new.direction = 'inbound' then 'WhatsApp in: ' else 'WhatsApp out: ' end || v_preview,
            jsonb_build_object('message_id', new.id, 'direction', new.direction), new.sent_by);
    if new.direction = 'outbound' then
      update public.leads set last_touch_at = now() where id = v_lead;
    end if;
  end if;
  return new;
end;
$$;
create trigger wa_messages_after_insert
  after insert on public.wa_messages
  for each row execute function public.wa_messages_after_insert();
revoke execute on function public.wa_messages_after_insert() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Webhook ingestion (called by the Edge Function with the service role).
-- Idempotent: a message id seen twice is stored once; statuses never go backwards.
-- -----------------------------------------------------------------------------
create function public.wa_status_rank(s public.wa_message_status)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case s when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3
                when 'failed' then 4 else 0 end;
$$;

create function public.wa_ingest(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb; v_change jsonb; v_value jsonb; v_msg jsonb; v_st jsonb; v_contact jsonb;
  v_number_id uuid; v_conv uuid; v_lead uuid; v_phone text; v_name text; v_body text; v_type text;
  v_status public.wa_message_status; v_ts timestamptz;
  v_new_messages int := 0; v_statuses int := 0;
begin
  if payload ->> 'object' is distinct from 'whatsapp_business_account' then
    return jsonb_build_object('ignored', true);
  end if;

  for v_entry in select * from jsonb_array_elements(coalesce(payload -> 'entry', '[]')) loop
    for v_change in select * from jsonb_array_elements(coalesce(v_entry -> 'changes', '[]')) loop
      continue when v_change ->> 'field' is distinct from 'messages';
      v_value := v_change -> 'value';

      -- the receiving number (created on first sight)
      insert into public.wa_numbers (phone_number_id, display_phone, label)
      values (v_value #>> '{metadata,phone_number_id}',
              '+' || regexp_replace(coalesce(v_value #>> '{metadata,display_phone_number}', ''), '[^0-9]', '', 'g'),
              'New number')
      on conflict (phone_number_id) do nothing;
      select id into v_number_id from public.wa_numbers where phone_number_id = v_value #>> '{metadata,phone_number_id}';

      -- inbound messages
      for v_msg in select * from jsonb_array_elements(coalesce(v_value -> 'messages', '[]')) loop
        continue when exists (select 1 from public.wa_messages where meta_message_id = v_msg ->> 'id');
        v_phone := '+' || regexp_replace(v_msg ->> 'from', '[^0-9]', '', 'g');
        v_name := null;
        for v_contact in select * from jsonb_array_elements(coalesce(v_value -> 'contacts', '[]')) loop
          if regexp_replace(v_contact ->> 'wa_id', '[^0-9]', '', 'g') = regexp_replace(v_msg ->> 'from', '[^0-9]', '', 'g') then
            v_name := v_contact #>> '{profile,name}';
          end if;
        end loop;
        v_ts := to_timestamp((v_msg ->> 'timestamp')::bigint);
        v_type := v_msg ->> 'type';
        v_body := coalesce(
          v_msg #>> '{text,body}',
          v_msg #>> '{button,text}',
          v_msg #>> '{interactive,button_reply,title}',
          v_msg #>> '{interactive,list_reply,title}',
          v_msg #>> '{image,caption}', v_msg #>> '{document,caption}', v_msg #>> '{video,caption}',
          v_msg #>> '{document,filename}',
          case when v_type = 'location' then 'Location: ' || (v_msg #>> '{location,latitude}') || ', ' || (v_msg #>> '{location,longitude}') end,
          case when v_type = 'reaction' then 'Reaction ' || coalesce(v_msg #>> '{reaction,emoji}', '') end);

        -- link to a lead by phone; unknown number → new lead (stage New, source whatsapp_inbound)
        select id into v_lead from public.leads where phone_e164 = v_phone;
        if v_lead is null then
          insert into public.leads (company, contact_name, phone_e164, source, stage)
          values (coalesce(nullif(v_name, ''), v_phone), v_name, v_phone, 'whatsapp_inbound', 'New')
          returning id into v_lead;
        end if;

        insert into public.wa_conversations (wa_number_id, contact_phone, contact_name, lead_id)
        values (v_number_id, v_phone, v_name, v_lead)
        on conflict (wa_number_id, contact_phone)
          do update set contact_name = coalesce(excluded.contact_name, public.wa_conversations.contact_name),
                        lead_id = coalesce(public.wa_conversations.lead_id, excluded.lead_id)
        returning id into v_conv;

        insert into public.wa_messages (conversation_id, direction, type, body, media_id, media_mime, media_filename,
                                        meta_message_id, status, cost_category, meta_timestamp)
        values (v_conv, 'inbound', v_type, v_body,
                coalesce(v_msg #>> '{image,id}', v_msg #>> '{document,id}', v_msg #>> '{audio,id}', v_msg #>> '{video,id}', v_msg #>> '{sticker,id}'),
                coalesce(v_msg #>> '{image,mime_type}', v_msg #>> '{document,mime_type}', v_msg #>> '{audio,mime_type}', v_msg #>> '{video,mime_type}', v_msg #>> '{sticker,mime_type}'),
                v_msg #>> '{document,filename}',
                v_msg ->> 'id', 'received', 'none', v_ts)
        on conflict (meta_message_id) do nothing;
        v_new_messages := v_new_messages + 1;

        -- opt-out (marketing template "Stop promotions" button or STOP / BAJA text)
        if v_type in ('button', 'text', 'interactive')
           and coalesce(v_body, '') ~* '^\s*(stop|stop promotions|unsubscribe|baja|darme de baja|detener promociones|no más promociones)\s*$' then
          update public.leads set whatsapp_opt_in = false where id = v_lead;
          insert into public.lead_events (lead_id, kind, body, user_id)
          values (v_lead, 'whatsapp', 'Opted out of WhatsApp promotions (' || v_body || ')', null);
        end if;
      end loop;

      -- delivery statuses of our outbound messages
      for v_st in select * from jsonb_array_elements(coalesce(v_value -> 'statuses', '[]')) loop
        v_status := case v_st ->> 'status'
                      when 'sent' then 'sent' when 'delivered' then 'delivered' when 'read' then 'read'
                      when 'failed' then 'failed' else null end;
        continue when v_status is null;
        v_ts := to_timestamp((v_st ->> 'timestamp')::bigint);
        update public.wa_messages m
           set status = case when public.wa_status_rank(v_status) > public.wa_status_rank(m.status) then v_status else m.status end,
               sent_at = coalesce(m.sent_at, case when v_status in ('sent', 'delivered', 'read') then v_ts end),
               delivered_at = coalesce(m.delivered_at, case when v_status in ('delivered', 'read') then v_ts end),
               read_at = coalesce(m.read_at, case when v_status = 'read' then v_ts end),
               error_code = coalesce(v_st #>> '{errors,0,code}', m.error_code),
               error_title = coalesce(v_st #>> '{errors,0,title}', v_st #>> '{errors,0,message}', m.error_title)
         where m.meta_message_id = v_st ->> 'id';
        if found then v_statuses := v_statuses + 1; end if;

        update public.wa_broadcast_recipients r
           set status = case
                 when v_status = 'failed' then 'failed'
                 when v_status = 'read' then 'read'
                 when v_status = 'delivered' and r.status in ('queued', 'sent') then 'delivered'
                 else r.status end,
               error_title = coalesce(v_st #>> '{errors,0,title}', r.error_title)
          from public.wa_messages m
         where m.meta_message_id = v_st ->> 'id' and r.message_id = m.id;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('messages', v_new_messages, 'statuses', v_statuses);
end;
$$;
revoke execute on function public.wa_ingest(jsonb) from public, anon, authenticated;
grant execute on function public.wa_ingest(jsonb) to service_role;
revoke execute on function public.wa_status_rank(public.wa_message_status) from public, anon;

-- Broadcast counters, recomputed from the recipients (cheap at HKR's volumes).
create function public.wa_refresh_broadcast_counts(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.wa_broadcasts b set
    count_queued    = (select count(*) from public.wa_broadcast_recipients r where r.broadcast_id = p_id and r.status = 'queued'),
    count_sent      = (select count(*) from public.wa_broadcast_recipients r where r.broadcast_id = p_id and r.status in ('sent', 'delivered', 'read')),
    count_delivered = (select count(*) from public.wa_broadcast_recipients r where r.broadcast_id = p_id and r.status in ('delivered', 'read')),
    count_read      = (select count(*) from public.wa_broadcast_recipients r where r.broadcast_id = p_id and r.status = 'read'),
    count_failed    = (select count(*) from public.wa_broadcast_recipients r where r.broadcast_id = p_id and r.status = 'failed'),
    count_skipped   = (select count(*) from public.wa_broadcast_recipients r where r.broadcast_id = p_id and r.status = 'skipped')
  where b.id = p_id;
$$;
revoke execute on function public.wa_refresh_broadcast_counts(uuid) from public, anon;
grant execute on function public.wa_refresh_broadcast_counts(uuid) to authenticated, service_role;

-- Only admin may approve or start a broadcast (bd prepares, admin sends — brief §8).
create function public.wa_broadcasts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and new.status in ('approved', 'sending', 'done', 'paused')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'Only an admin can approve or send a broadcast';
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$$;
create trigger wa_broadcasts_guard
  before insert or update on public.wa_broadcasts
  for each row execute function public.wa_broadcasts_guard();
revoke execute on function public.wa_broadcasts_guard() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Grants and RLS
-- -----------------------------------------------------------------------------
revoke all on public.wa_numbers, public.wa_conversations, public.wa_messages, public.wa_webhook_events,
              public.wa_templates, public.wa_broadcasts, public.wa_broadcast_recipients, public.notifications
  from anon;

grant select, insert, update on public.wa_numbers to authenticated;
grant select, insert, update on public.wa_conversations to authenticated;
grant select, insert, update on public.wa_messages to authenticated;
grant select on public.wa_webhook_events to authenticated;
grant select, insert, update, delete on public.wa_templates to authenticated;
grant select, insert, update on public.wa_broadcasts to authenticated;
grant select, insert, update, delete on public.wa_broadcast_recipients to authenticated;
grant select, update on public.notifications to authenticated;

create policy wa_numbers_read on public.wa_numbers
  for select to authenticated using ((select public.is_staff()));
create policy wa_numbers_admin_insert on public.wa_numbers
  for insert to authenticated with check ((select public.is_admin()));
create policy wa_numbers_admin_update on public.wa_numbers
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy wa_conversations_read on public.wa_conversations
  for select to authenticated using (public.can_see_conversation(id));
create policy wa_conversations_insert on public.wa_conversations
  for insert to authenticated
  with check ((select public.is_staff()) and (assigned_user_id is null or assigned_user_id = (select auth.uid()) or (select public.is_admin())));
create policy wa_conversations_update on public.wa_conversations
  for update to authenticated using (public.can_see_conversation(id)) with check ((select public.is_staff()));

create policy wa_messages_read on public.wa_messages
  for select to authenticated using (public.can_see_conversation(conversation_id));
create policy wa_messages_insert on public.wa_messages
  for insert to authenticated
  with check (direction = 'outbound' and public.can_see_conversation(conversation_id));
create policy wa_messages_update on public.wa_messages
  for update to authenticated
  using (public.can_see_conversation(conversation_id)) with check (public.can_see_conversation(conversation_id));

create policy wa_webhook_events_admin_read on public.wa_webhook_events
  for select to authenticated using ((select public.is_admin()));

create policy wa_templates_read on public.wa_templates
  for select to authenticated using ((select public.is_staff()));
create policy wa_templates_admin_insert on public.wa_templates
  for insert to authenticated with check ((select public.is_admin()));
create policy wa_templates_admin_update on public.wa_templates
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy wa_templates_admin_delete on public.wa_templates
  for delete to authenticated using ((select public.is_admin()));

-- Broadcasts: admin and bd (brief §8: AS has no access).
create policy wa_broadcasts_read on public.wa_broadcasts
  for select to authenticated using ((select public.can_work_leads()));
create policy wa_broadcasts_insert on public.wa_broadcasts
  for insert to authenticated with check ((select public.can_work_leads()));
create policy wa_broadcasts_update on public.wa_broadcasts
  for update to authenticated
  using ((select public.is_admin()) or (created_by = (select auth.uid()) and status in ('draft', 'pending_approval')))
  with check ((select public.can_work_leads()));

create policy wa_broadcast_recipients_read on public.wa_broadcast_recipients
  for select to authenticated using ((select public.can_work_leads()));
create policy wa_broadcast_recipients_write on public.wa_broadcast_recipients
  for insert to authenticated with check ((select public.can_work_leads()));
create policy wa_broadcast_recipients_update on public.wa_broadcast_recipients
  for update to authenticated using ((select public.can_work_leads())) with check ((select public.can_work_leads()));
create policy wa_broadcast_recipients_delete on public.wa_broadcast_recipients
  for delete to authenticated
  using ((select public.can_work_leads()) and status = 'queued');

create policy notifications_own_read on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Realtime for the inbox (RLS applies to realtime events too)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.wa_messages, public.wa_conversations, public.notifications;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Private Storage bucket for WhatsApp media (server-side access only)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('wa-media', 'wa-media', false, 104857600)
    on conflict (id) do nothing;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Every-minute worker: Supabase cron calls the app's worker route. It does
-- nothing until the admin stores the app URL (setting app_base_url) and the
-- shared secret in Supabase Vault under the name "cron_secret".
-- -----------------------------------------------------------------------------
create function public.wa_worker_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select value #>> '{}' into v_url from public.settings where key = 'app_base_url';
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  exception when others then
    v_secret := null;
  end;
  if v_url is null or v_url = '' or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/api/cron/wa-worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000);
end;
$$;
revoke execute on function public.wa_worker_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wa-worker') then
    perform cron.unschedule('wa-worker');
  end if;
  perform cron.schedule('wa-worker', '* * * * *', 'select public.wa_worker_tick()');
end $$;

-- -----------------------------------------------------------------------------
-- Settings for Phase 2
-- -----------------------------------------------------------------------------
insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('app_base_url', 'whatsapp', 'App address', '"https://hkr-system.vercel.app"', false, 400,
   'Used by the every-minute WhatsApp worker.'),
  ('wa_number_by_market', 'whatsapp', 'WhatsApp number per market',
   '{"EU": null, "LATAM": null, "US": null, "ROW": null}', false, 410,
   'Which number writes to each market. Decided Oct 2026: LATAM → US number; EU (incl. UK) → European numbers. Not configured yet.'),
  ('wa_welcome_template', 'whatsapp', 'Welcome template for /apply leads',
   '{"name": "", "language_en": "en", "language_es": "es"}', false, 420,
   'Sent to new form leads who opted in to WhatsApp. Empty name = not sent (no template exists yet, Oct 2026).'),
  ('wa_graph_version', 'whatsapp', 'Meta Graph API version', '"v25.0"', false, 430,
   'Version used for all WhatsApp API calls.'),
  ('email_sender', 'email', 'System email sender', '{"email": "noreply@hk-refurbished-stock.com", "name": "HKR System"}', false, 500,
   'Sender of system emails sent through Brevo (needs SPF/DKIM on the domain).')
on conflict (key) do nothing;
