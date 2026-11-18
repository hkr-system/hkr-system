-- The account specialist no longer uses Leads or WhatsApp (Gabriel, Nov 18 2026: "ella no debe tener acceso a Leads, WhatsApp,
-- Finance o Settings" — Finance and Settings were already admin only). Access is by ROLE (src/lib/nav.ts + RLS here), so it
-- applies to every account specialist. Admin and bd keep everything (can_work_leads() = admin or bd).
--   * leads + lead timeline: read only for admin / bd
--   * WhatsApp chats, messages, numbers and templates: admin / bd only; new-message notifications only to admin / bd
--   * a contact saved on an account still links its WhatsApp chat to the account (now done by the database, so it also
--     works when the specialist saves the contact)

-- leads
drop policy leads_read on public.leads;
create policy leads_read on public.leads
  for select to authenticated using ((select public.can_work_leads()));
drop policy lead_events_read on public.lead_events;
create policy lead_events_read on public.lead_events
  for select to authenticated using ((select public.can_work_leads()));

-- WhatsApp: who sees a conversation (same rule as before, now admin / bd only)
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
       and public.can_work_leads()
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
  with check ((select public.can_work_leads()) and (assigned_user_id is null or assigned_user_id = (select auth.uid()) or (select public.is_admin())));
drop policy wa_numbers_read on public.wa_numbers;
create policy wa_numbers_read on public.wa_numbers
  for select to authenticated using ((select public.can_work_leads()));
drop policy wa_templates_read on public.wa_templates;
create policy wa_templates_read on public.wa_templates
  for select to authenticated using ((select public.can_work_leads()));

-- new WhatsApp message → bell for admin / bd only (assignee, or everyone of them when unassigned)
create or replace function public.wa_notify_inbound()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv record;
  v_who text;
  v_link text;
  v_bc record;
  u record;
begin
  if new.direction <> 'inbound' then
    return new;
  end if;
  select c.id, c.assigned_user_id, c.contact_name, c.contact_phone, l.company
    into v_conv
    from public.wa_conversations c left join public.leads l on l.id = c.lead_id
   where c.id = new.conversation_id;
  v_who := coalesce(v_conv.company, v_conv.contact_name, v_conv.contact_phone);
  v_link := '/whatsapp?c=' || v_conv.id;

  for u in
    select p.user_id from public.profiles p
     where p.active and p.role in ('admin', 'bd')
       and (v_conv.assigned_user_id is null or p.user_id = v_conv.assigned_user_id)
  loop
    perform public.notify_upsert(u.user_id, 'wa_message', 'New WhatsApp from ' || v_who,
                                 left(coalesce(new.body, '[' || new.type || ']'), 140), v_link);
  end loop;

  -- reply to a broadcast: the last outbound message of this chat came from a broadcast
  select b.id, b.name, b.created_by into v_bc
    from public.wa_messages m join public.wa_broadcasts b on b.id = m.broadcast_id
   where m.conversation_id = new.conversation_id and m.direction = 'outbound' and m.id <> new.id
   order by m.created_at desc limit 1;
  if v_bc.id is not null and v_bc.created_by is not null then
    perform public.notify_upsert(v_bc.created_by, 'broadcast_reply', 'Reply to broadcast "' || v_bc.name || '"',
                                 v_who || ': ' || left(coalesce(new.body, '[' || new.type || ']'), 120), v_link);
  end if;
  return new;
end;
$$;

-- the specialist's unread WhatsApp / lead notices are marked as read (they would open a page she can no longer see; nothing deleted)
update public.notifications n set read_at = now()
  from public.profiles p
 where p.user_id = n.user_id and p.role = 'account_specialist' and n.read_at is null
   and n.kind in ('wa_message', 'broadcast_reply', 'lead_new', 'new_lead', 'lead_qualified');

-- a contact's phone links an open WhatsApp chat to its account (was done by the app; RLS now hides chats from the specialist)
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
