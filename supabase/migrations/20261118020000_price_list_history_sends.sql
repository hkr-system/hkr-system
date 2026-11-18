-- Price list history and "sent to the client" (Gabriel, Nov 18 2026: "es importante saber qué versión del pricelist tiene cada
-- cliente"):
--   * price_list_sends: each time a CLIENT list (approved or superseded, never a draft) is sent to the client — date, channel
--     (WhatsApp, email, portal, in person, other), note. Anyone who can see the account records it; the author or an admin
--     removes a mistake. The newest send tells which version the client has in hand.
--   * price_list_base_versions(): the version number and date of every base list, for the History page and the "built on
--     base vN" column — NO prices (the base itself stays admin-only).

create table public.price_list_sends (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.price_lists (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  sent_on date not null default current_date,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'portal', 'in_person', 'other')),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);
create index price_list_sends_list_idx on public.price_list_sends (price_list_id);
create index price_list_sends_account_idx on public.price_list_sends (account_id, sent_on desc);
select public.setup_table('public.price_list_sends');

create function public.price_list_sends_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select account_id, status into l from public.price_lists where id = new.price_list_id;
  if l.account_id is null then
    raise exception 'Only a client''s price list is sent to a client.' using errcode = '23514';
  end if;
  if l.status = 'draft' then
    raise exception 'A draft is not sent: the admin approves it first.' using errcode = '23514';
  end if;
  new.account_id := l.account_id;
  return new;
end;
$$;
create trigger price_list_sends_check before insert or update on public.price_list_sends
  for each row execute function public.price_list_sends_check();
revoke execute on function public.price_list_sends_check() from public, anon, authenticated;

create policy price_list_sends_select on public.price_list_sends for select to authenticated
  using ((select public.has_account_access(account_id)));
create policy price_list_sends_insert on public.price_list_sends for insert to authenticated
  with check ((select public.has_account_access(account_id)));
create policy price_list_sends_delete on public.price_list_sends for delete to authenticated
  using ((select public.is_admin()) or (created_by = (select auth.uid()) and (select public.has_account_access(account_id))));

create function public.price_list_base_versions()
returns table (id uuid, brand public.product_brand, version int, status public.price_list_status, valid_from date, approved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.brand, l.version, l.status, l.valid_from, l.approved_at
    from public.price_lists l
   where l.account_id is null and l.status <> 'draft' and public.is_staff()
   order by l.brand, l.version desc;
$$;
revoke execute on function public.price_list_base_versions() from public, anon;
grant execute on function public.price_list_base_versions() to authenticated;
