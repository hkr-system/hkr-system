-- Module access PER USER (Gabriel, Nov 18 2026: "debe haber un lugar donde yo pueda cambiar los accesos a los módulos… que
-- los módulos no interfieran con otros"). Settings → Users: one Yes/No box per module for each person.
--   * profiles.sections = the modules this person may use; NULL = every module of the role (as before).
--   * The ROLE is the ceiling: Finance and Settings stay admin-only; an admin always has every module (cannot be locked out).
--   * Only an admin changes it (trigger below; the audit log keeps every change).
--   * has_section(key) is the one rule used by the menu, the pages and the database. In the database it guards the modules
--     whose data lives only there: Leads (leads, timeline, form submissions, imports) and WhatsApp (chats, messages, numbers,
--     templates, broadcasts). Data of other modules shown inside Accounts (orders, RMAs, price lists) is not affected.
--   * A contact's phone still links its WhatsApp chat to the account (now done by the database, so it works for anyone).
-- (This file replaces the role-only version prepared earlier the same day; that version never ran on the hosted project.)

alter table public.profiles add column if not exists sections text[];
alter table public.profiles add constraint profiles_sections_check
  check (sections is null or sections <@ array['dashboard', 'accounts', 'orders', 'rmas', 'price-lists', 'leads', 'whatsapp']::text[]);
comment on column public.profiles.sections is 'Modules this user may use (Settings → Users); NULL = all modules of the role. Admin only edits.';
grant update (sections) on public.profiles to authenticated;

create function public.profiles_sections_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sections is distinct from old.sections and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin changes the modules of a user.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_sections_guard before update of sections on public.profiles
  for each row execute function public.profiles_sections_guard();
revoke execute on function public.profiles_sections_guard() from public, anon, authenticated;

-- may this user use this module? (role ceiling + the boxes ticked by the admin)
create function public.has_section_for(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.active and p.role is not null
       and (case when p_key in ('finance', 'settings') then p.role = 'admin' else true end)
       and (p.role = 'admin' or p.sections is null or p_key = any (p.sections))
      from public.profiles p where p.user_id = p_user), false);
$$;
create function public.has_section(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_section_for((select auth.uid()), p_key);
$$;
revoke execute on function public.has_section_for(uuid, text) from public, anon, authenticated;
revoke execute on function public.has_section(text) from public, anon;
grant execute on function public.has_section(text) to authenticated;

-- Leads: working leads = admin / bd WITH the Leads module; reading = anyone with the Leads module (specialist read-only)
create or replace function public.can_work_leads()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'bd'), false) and public.has_section('leads');
$$;
drop policy leads_read on public.leads;
create policy leads_read on public.leads
  for select to authenticated using ((select public.has_section('leads')));
drop policy lead_events_read on public.lead_events;
create policy lead_events_read on public.lead_events
  for select to authenticated using ((select public.has_section('leads')));

-- WhatsApp: same visibility rule as before, now only with the WhatsApp module
create or replace function public.can_see_conversation(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wa_conversations c
     where c.id = p_id
       and public.has_section('whatsapp')
       and (
         public.is_admin()
         or c.assigned_user_id is null
         or c.assigned_user_id = (select auth.uid())
         or (c.account_id is not null and public.has_account_access(c.account_id))
       ));
$$;
drop policy wa_conversations_insert on public.wa_conversations;
create policy wa_conversations_insert on public.wa_conversations
  for insert to authenticated
  with check ((select public.has_section('whatsapp')) and (assigned_user_id is null or assigned_user_id = (select auth.uid()) or (select public.is_admin())));
drop policy wa_numbers_read on public.wa_numbers;
create policy wa_numbers_read on public.wa_numbers
  for select to authenticated using ((select public.has_section('whatsapp')));
drop policy wa_templates_read on public.wa_templates;
create policy wa_templates_read on public.wa_templates
  for select to authenticated using ((select public.has_section('whatsapp')));

-- broadcasts belong to WhatsApp (admin / bd as before), no longer to Leads
create function public.can_broadcast()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'bd'), false) and public.has_section('whatsapp');
$$;
revoke execute on function public.can_broadcast() from public, anon;
grant execute on function public.can_broadcast() to authenticated;
drop policy wa_broadcasts_read on public.wa_broadcasts;
create policy wa_broadcasts_read on public.wa_broadcasts
  for select to authenticated using ((select public.can_broadcast()));
drop policy wa_broadcasts_insert on public.wa_broadcasts;
create policy wa_broadcasts_insert on public.wa_broadcasts
  for insert to authenticated with check ((select public.can_broadcast()));
drop policy wa_broadcasts_update on public.wa_broadcasts;
create policy wa_broadcasts_update on public.wa_broadcasts
  for update to authenticated
  using ((select public.is_admin()) or (created_by = (select auth.uid()) and status in ('draft', 'pending_approval')))
  with check ((select public.can_broadcast()));
drop policy wa_broadcast_recipients_read on public.wa_broadcast_recipients;
create policy wa_broadcast_recipients_read on public.wa_broadcast_recipients
  for select to authenticated using ((select public.can_broadcast()));
drop policy wa_broadcast_recipients_write on public.wa_broadcast_recipients;
create policy wa_broadcast_recipients_write on public.wa_broadcast_recipients
  for insert to authenticated with check ((select public.can_broadcast()));
drop policy wa_broadcast_recipients_update on public.wa_broadcast_recipients;
create policy wa_broadcast_recipients_update on public.wa_broadcast_recipients
  for update to authenticated using ((select public.can_broadcast())) with check ((select public.can_broadcast()));
drop policy wa_broadcast_recipients_delete on public.wa_broadcast_recipients;
create policy wa_broadcast_recipients_delete on public.wa_broadcast_recipients
  for delete to authenticated
  using ((select public.can_broadcast()) and status = 'queued');

-- a contact's phone links an open WhatsApp chat to its account (was done by the app with the user's rights)
create function public.contacts_link_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_id is not null and new.phone_e164 is not null then
    update public.wa_conversations set account_id = new.account_id
     where contact_phone = new.phone_e164 and account_id is null;
  end if;
  return null;
end;
$$;
create trigger contacts_link_chat after insert or update of phone_e164, account_id on public.contacts
  for each row execute function public.contacts_link_chat();
revoke execute on function public.contacts_link_chat() from public, anon, authenticated;
