-- Phase 5 — Dashboard, reports and queues (brief §8, SOP P5, P8, P9; plan approved by Gabriel Nov 3 2026).
--   client_updates : what was sent to a client and when — the Thursday 3-line update, the Tuesday/Wednesday RMA ask
--                    (clients of an EU intermediary) and balance reminders (the daily report shows "reminded dd-mmm (1st)").
--   escalations    : "prepare for SD" items (SOP P8 / §3.5) in the fixed order of the SOP; only an admin answers and closes.
--   settings       : deposit_overdue_days (alert), report weekdays, last daily report sent.

-- -----------------------------------------------------------------------------
-- 1. Settings
-- -----------------------------------------------------------------------------
insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('deposit_overdue_days', 'operations', 'Deposit overdue after (days)', '3', false, 32,
   'An invoiced order without a confirmed deposit after this many days shows as an overdue alert on the dashboard.'),
  ('last_daily_report', 'operations', 'Last daily report emailed', 'null', false, 34,
   'Set by the system after the 18:00 HK email (Internal Orders + Internal RMA''s). Do not edit.')
on conflict (key) do nothing;

-- the report is emailed on working days (Monday–Friday by default; edit the list in Settings → Operations)
update public.settings
   set value = value || '{"weekdays": [1, 2, 3, 4, 5]}'::jsonb
 where key = 'report_time' and jsonb_typeof(value) = 'object' and not (value ? 'weekdays');

-- -----------------------------------------------------------------------------
-- 2. client_updates
-- -----------------------------------------------------------------------------
create table public.client_updates (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  kind        text not null check (kind in ('thursday', 'rma_ask', 'balance_reminder')),
  week_start  date not null,                       -- Monday of the week (Hong Kong date) the update belongs to
  order_ids   uuid[] not null default '{}',        -- orders it covers (balance reminder: the one order)
  channel     text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'other')),
  language    text not null default 'en' check (language in ('en', 'es')),
  message     text not null default '',
  sent_at     timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
create index client_updates_account_idx on public.client_updates (account_id, kind, week_start);
create index client_updates_orders_idx on public.client_updates using gin (order_ids);
select public.setup_table('public.client_updates');

revoke all on public.client_updates from anon;
grant select, insert, update, delete on public.client_updates to authenticated;
create policy client_updates_read on public.client_updates
  for select to authenticated using (public.has_account_access(account_id));
create policy client_updates_insert on public.client_updates
  for insert to authenticated with check ((select public.is_staff()) and public.has_account_access(account_id));
create policy client_updates_update on public.client_updates
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
-- "undo" right after a mistaken click: the author (same day) or an admin
create policy client_updates_delete on public.client_updates
  for delete to authenticated using (
    (select public.is_admin()) or (created_by = (select auth.uid()) and created_at > now() - interval '1 day'));

-- -----------------------------------------------------------------------------
-- 3. escalations (SOP §3.5: Client · Order · Invoice value · What happened · Evidence · Figures ·
--    What the client asks · What you propose · When the client expects an answer)
-- -----------------------------------------------------------------------------
create table public.escalations (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.accounts (id) on delete cascade,
  order_id            uuid references public.orders (id) on delete set null,
  rma_id              uuid references public.rmas (id) on delete set null,
  topic               text not null default 'other' check (topic in
                        ('price', 'discount', 'credit', 'date', 'vat_legal', 'refurbishment', 'carrier', 'costs',
                         'other_clients', 'other')),
  what_happened       text not null check (length(trim(what_happened)) > 0),
  evidence            text,
  figures             text,
  client_asks         text,
  proposal            text,
  answer_by           timestamptz,               -- when the client expects an answer
  status              text not null default 'open' check (status in ('open', 'closed')),
  decision            text,                      -- the SD's answer
  decided_by          uuid,
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now()
);
create index escalations_status_idx on public.escalations (status, answer_by);
create index escalations_account_idx on public.escalations (account_id);
select public.setup_table('public.escalations');

-- Only an admin (the SD) writes the decision or closes; the author can still correct the facts while it is open.
create function public.escalations_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_admin() then
    if new.status = 'closed' and old.status is distinct from 'closed' then
      new.decided_at := coalesce(new.decided_at, now());
      new.decided_by := coalesce(new.decided_by, (select auth.uid()));
    elsif new.status = 'open' then
      new.decided_at := null; new.decided_by := null;
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.decision is distinct from old.decision
     or new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at then
    raise exception 'Only an admin answers and closes an escalation.' using errcode = '42501';
  end if;
  if old.status = 'closed' then
    raise exception 'This escalation is closed.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger escalations_guard
  before update on public.escalations
  for each row execute function public.escalations_guard();
revoke execute on function public.escalations_guard() from public, anon, authenticated;

-- new rows always start open, without a decision (also for admins: they close it in a second step)
create function public.escalations_new()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := 'open'; new.decision := null; new.decided_by := null; new.decided_at := null;
  return new;
end;
$$;
create trigger escalations_new
  before insert on public.escalations
  for each row execute function public.escalations_new();
revoke execute on function public.escalations_new() from public, anon, authenticated;

revoke all on public.escalations from anon;
grant select, insert, update, delete on public.escalations to authenticated;
create policy escalations_read on public.escalations
  for select to authenticated using (public.has_account_access(account_id));
create policy escalations_insert on public.escalations
  for insert to authenticated with check ((select public.is_staff()) and public.has_account_access(account_id));
create policy escalations_update on public.escalations
  for update to authenticated
  using ((select public.is_admin()) or (created_by = (select auth.uid()) and public.has_account_access(account_id)))
  with check ((select public.is_admin()) or (created_by = (select auth.uid()) and public.has_account_access(account_id)));
create policy escalations_delete on public.escalations
  for delete to authenticated using ((select public.is_admin()));
