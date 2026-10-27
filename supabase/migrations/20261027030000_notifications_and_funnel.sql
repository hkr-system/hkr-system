-- =============================================================================
-- HKR System — automatic notifications + lead funnel (requested by Gabriel, Oct 27 2026)
--   * new WhatsApp message  → assignee, or every active user when unassigned
--     (one unread notification per conversation, bumped on each new message)
--   * reply to a broadcast   → the user who created the broadcast
--   * new lead from the /apply form or WhatsApp → owner, or every admin + bd user
--   * lead_funnel(): how many leads ever reached each stage (for the Leads overview)
-- Accounts needing attention / RMA batches ready are added with Phases 3 and 4.
-- =============================================================================

-- Insert or bump one unread notification per (user, kind, link).
create function public.notify_upsert(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
     set title = p_title, body = p_body, created_at = now()
   where user_id = p_user and kind = p_kind and link is not distinct from p_link and read_at is null;
  if not found then
    insert into public.notifications (user_id, kind, title, body, link)
    values (p_user, p_kind, p_title, p_body, p_link);
  end if;
end;
$$;
revoke execute on function public.notify_upsert(uuid, text, text, text, text) from public, anon, authenticated;

create function public.wa_notify_inbound()
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
     where p.active and p.role is not null
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
create trigger wa_notify_inbound
  after insert on public.wa_messages
  for each row execute function public.wa_notify_inbound();
revoke execute on function public.wa_notify_inbound() from public, anon, authenticated;

create function public.leads_notify_new()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  if new.source not in ('website_form', 'whatsapp_inbound') then
    return new;
  end if;
  for u in
    select p.user_id from public.profiles p
     where p.active
       and (case when new.owner_user_id is not null then p.user_id = new.owner_user_id
                 else p.role in ('admin', 'bd') end)
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (u.user_id, 'new_lead',
            'New lead: ' || new.company,
            case new.source when 'website_form' then 'From the website form' else 'Wrote on WhatsApp' end
              || coalesce(' · Tier ' || new.tier, '') || case when new.disqualified then ' · disqualified' else '' end,
            '/leads/' || new.id);
  end loop;
  return new;
end;
$$;
create trigger leads_notify_new
  after insert on public.leads
  for each row execute function public.leads_notify_new();
revoke execute on function public.leads_notify_new() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lead funnel: for each stage New → Won, how many leads reached it at some point
-- (current stage or any earlier stage change), and how many are in it now.
-- Runs with the caller's rights, so RLS applies. Disqualified leads are left out.
-- -----------------------------------------------------------------------------
create function public.lead_funnel(p_since timestamptz default null)
returns table (stage public.lead_stage, reached integer, current integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select l.id, l.stage
      from public.leads l
     where not l.disqualified
       and (p_since is null or l.created_at >= p_since)
  ), best as (
    select b.id, b.stage as current_stage,
           greatest(
             case when b.stage = 'Lost' then 'New'::public.lead_stage else b.stage end,
             coalesce((select max((e.data ->> 'to')::public.lead_stage)
                         from public.lead_events e
                        where e.lead_id = b.id and e.kind = 'stage_change'
                          and e.data ->> 'to' is not null and e.data ->> 'to' <> 'Lost'), 'New')
           ) as max_stage
      from base b
  )
  select s.stage,
         (select count(*)::int from best where best.max_stage >= s.stage) as reached,
         (select count(*)::int from best where best.current_stage = s.stage) as current
    from unnest(enum_range('New'::public.lead_stage, 'Won'::public.lead_stage)) as s(stage)
  union all
  select 'Lost'::public.lead_stage, 0, (select count(*)::int from best where current_stage = 'Lost');
$$;
revoke execute on function public.lead_funnel(timestamptz) from public, anon;
grant execute on function public.lead_funnel(timestamptz) to authenticated;
