-- Phase 6 (Part A) — Price lists (Gabriel, Nov 2 2026). SOP chapter 5 + P7, brief Phase 6 items 1–3, 5, 6, 8.
--   * BASE list (account_id null): admin only, uploaded from the iPhonePrices xlsx (already carries the 6 % margin).
--   * Client list per account: List = Base × (1 + RMA_c + Extra_c), Floor = Base × (1 + RMA_c); the engine runs in the app
--     (src/lib/price-lists/engine.ts) and stores its inputs + decision in `engine`.
--   * One price per model + GB = every colour (as in the iPhonePrices file).
--   * Specialist and admin prepare; only admin approves; an approved list is frozen; the previous one is superseded.
--   * Floors: admin, specialist and bd of the account see them (Gabriel: bd sees list + floor). Clients see prices only.
--   * Order lines remember the list row and list price they came from; a different unit price = "manual" (logged).

-- -----------------------------------------------------------------------------
-- 1. Settings (SOP 5.2: window and the standard cost of a unit returned to HK)
-- -----------------------------------------------------------------------------
insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('engine_rma_window_days', 'engine', 'RMA window (days)', '180', true, 172,
   'RMA_c looks at the last 180 days, or the last orders below if they cover more (SOP 5.2).'),
  ('engine_rma_window_orders', 'engine', 'RMA window (orders)', '5', true, 174,
   'RMA_c window: the last 5 orders when they go further back than the days above (SOP 5.2).'),
  ('engine_rma_unit_cost_usd', 'engine', 'Cost of a unit returned to HK (US$)', '45', true, 176,
   'All-in: labor, parts and shipping (SOP 5.2).')
on conflict (key) do nothing;

alter type public.file_kind add value if not exists 'PL';

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------
create type public.price_list_status as enum ('draft', 'approved', 'superseded');

create table public.price_lists (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid references public.accounts (id) on delete cascade,   -- null = BASE list
  version         integer not null default 0,                               -- per account (or base), by trigger
  status          public.price_list_status not null default 'draft',
  valid_from      date not null default current_date,
  valid_until     date,                                                     -- client lists: valid_from + refresh days
  base_list_id    uuid references public.price_lists (id) on delete restrict,
  rma_c           numeric(6, 3),      -- % applied
  extra_c         numeric(6, 3),      -- % applied
  engine          jsonb not null default '{}',   -- inputs, suggestions and the decision lines (no base prices)
  source_file     text,
  note            text,
  approved_at     timestamptz,
  approved_by     uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  constraint price_lists_client_fields check (account_id is not null or (base_list_id is null and rma_c is null and extra_c is null))
);
create unique index price_lists_one_approved on public.price_lists
  (coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'approved';
create index price_lists_account_idx on public.price_lists (account_id, version desc);
select public.setup_table('public.price_lists');

create table public.price_list_rows (
  id              uuid primary key default gen_random_uuid(),
  price_list_id   uuid not null references public.price_lists (id) on delete cascade,
  account_id      uuid references public.accounts (id) on delete cascade,   -- copied from the list (RLS); null = base
  model           text not null,           -- normalized: "iPhone 15 Pro Max"
  storage_gb      integer not null check (storage_gb > 0),
  note            text,                    -- shown after the model: "esim+regular sim"
  price_usd       numeric(12, 2) not null check (price_usd >= 0),
  floor_usd       numeric(12, 2) check (floor_usd >= 0),   -- client lists only
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  unique (price_list_id, model, storage_gb)
);
create index price_list_rows_list_idx on public.price_list_rows (price_list_id, sort_order);
select public.setup_table('public.price_list_rows');

alter table public.order_lines
  add column price_list_row_id uuid references public.price_list_rows (id) on delete set null,
  add column list_price_usd    numeric(12, 2),
  add column price_source      text not null default 'manual' check (price_source in ('list', 'manual', 'promotion'));

-- -----------------------------------------------------------------------------
-- 3. Rules (triggers)
-- -----------------------------------------------------------------------------
create function public.price_lists_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := auth.uid() is null or public.is_admin();
  v_days int;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'A new price list starts as Draft.' using errcode = '42501'; end if;
    if new.account_id is null and not v_admin then raise exception 'Only an admin can create the base list.' using errcode = '42501'; end if;
    select coalesce(max(version), 0) + 1 into new.version from public.price_lists
     where account_id is not distinct from new.account_id;
    if new.account_id is not null and new.valid_until is null then
      select coalesce((value #>> '{}')::int, 14) into v_days from public.settings where key = 'engine_refresh_days';
      new.valid_until := new.valid_from + coalesce(v_days, 14);
    end if;
    return new;
  end if;

  if new.account_id is distinct from old.account_id or new.version is distinct from old.version then
    raise exception 'A price list keeps its account and version.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' and old.status = 'draft' then
      if not v_admin then raise exception 'Only an admin can approve a price list.' using errcode = '42501'; end if;
      if not exists (select 1 from public.price_list_rows r where r.price_list_id = new.id) then
        raise exception 'The list has no prices.' using errcode = '23514';
      end if;
      update public.price_lists set status = 'superseded'
       where account_id is not distinct from new.account_id and status = 'approved' and id <> new.id;
      new.approved_at := now(); new.approved_by := auth.uid();
    elsif new.status = 'superseded' and old.status = 'approved' and pg_trigger_depth() > 1 then
      null; -- set by the approval of the next version
    else
      raise exception 'Price list status cannot go from % to %.', old.status, new.status using errcode = '42501';
    end if;
  elsif old.status <> 'draft' then
    if (new.valid_from, new.valid_until, new.base_list_id, new.rma_c, new.extra_c, new.engine)
       is distinct from (old.valid_from, old.valid_until, old.base_list_id, old.rma_c, old.extra_c, old.engine) then
      raise exception 'An approved price list cannot be edited: prepare a new version.' using errcode = '42501';
    end if;
  elsif (new.rma_c is distinct from old.rma_c or new.extra_c is distinct from old.extra_c) and not v_admin then
    -- the specialist lets the engine decide (SOP P7: set when the draft is prepared); only the admin overrides
    raise exception 'Only an admin can change the percentages.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger price_lists_before_write
  before insert or update on public.price_lists
  for each row execute function public.price_lists_before_write();
revoke execute on function public.price_lists_before_write() from public, anon, authenticated;

-- Rows follow their list: account copied, only drafts change (the trigger itself is allowed while approving).
create function public.price_list_rows_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.price_list_status;
begin
  select l.account_id, l.status into new.account_id, v_status
    from public.price_lists l where l.id = coalesce(new.price_list_id, old.price_list_id);
  if v_status is distinct from 'draft' and auth.uid() is not null then
    raise exception 'An approved price list cannot be edited: prepare a new version.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger price_list_rows_before_write
  before insert or update on public.price_list_rows
  for each row execute function public.price_list_rows_before_write();
revoke execute on function public.price_list_rows_before_write() from public, anon, authenticated;

create function public.price_list_rows_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.price_lists l where l.id = old.price_list_id and l.status <> 'draft')
     and auth.uid() is not null and pg_trigger_depth() = 1 then
    raise exception 'An approved price list cannot be edited: prepare a new version.' using errcode = '42501';
  end if;
  return old;
end;
$$;
create trigger price_list_rows_before_delete
  before delete on public.price_list_rows
  for each row execute function public.price_list_rows_before_delete();
revoke execute on function public.price_list_rows_before_delete() from public, anon, authenticated;

-- Order lines: the list price must come from an approved (or superseded) list of the same account, never a draft; the source follows the price;
-- the base price (admin-only finance row) is filled from the base list behind that client list.
create function public.order_lines_price_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price numeric; v_account uuid; v_status public.price_list_status;
begin
  if new.price_list_row_id is null then
    new.list_price_usd := null;
    if new.price_source = 'list' then new.price_source := 'manual'; end if;
    return new;
  end if;
  select r.price_usd, l.account_id, l.status into v_price, v_account, v_status
    from public.price_list_rows r join public.price_lists l on l.id = r.price_list_id
   where r.id = new.price_list_row_id;
  -- an approved list of this account (or an earlier approved one, now superseded, when an order is edited)
  if v_account is distinct from (select o.account_id from public.orders o where o.id = new.order_id)
     or v_status is not distinct from 'draft' or v_status is null then
    raise exception 'The price must come from the account''s approved price list.' using errcode = '42501';
  end if;
  new.list_price_usd := v_price;
  if new.price_source <> 'promotion' then
    new.price_source := case when new.unit_price_usd = v_price then 'list' else 'manual' end;
  end if;
  return new;
end;
$$;
create trigger order_lines_price_source
  before insert or update of price_list_row_id, unit_price_usd, price_source on public.order_lines
  for each row execute function public.order_lines_price_source();
revoke execute on function public.order_lines_price_source() from public, anon, authenticated;

create function public.order_lines_base_from_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base numeric;
begin
  if new.price_list_row_id is null then return null; end if;
  select b.price_usd into v_base
    from public.price_list_rows r
    join public.price_lists l on l.id = r.price_list_id
    join public.price_list_rows b on b.price_list_id = l.base_list_id and b.model = r.model and b.storage_gb = r.storage_gb
   where r.id = new.price_list_row_id;
  if v_base is null then return null; end if;
  insert into public.order_lines_finance (order_line_id, base_price_usd) values (new.id, v_base)
  on conflict (order_line_id) do update set base_price_usd = coalesce(public.order_lines_finance.base_price_usd, excluded.base_price_usd);
  return null;
end;
$$;
create trigger order_lines_base_from_list
  after insert or update of price_list_row_id on public.order_lines
  for each row execute function public.order_lines_base_from_list();
revoke execute on function public.order_lines_base_from_list() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Access
--    base list + rows: admin only · client lists: admin + specialist (all accounts) and bd (own accounts, not drafts)
--    write: admin, or the specialist on client lists; approve: admin (trigger); delete: drafts only
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.price_lists, public.price_list_rows to authenticated;

create policy price_lists_read on public.price_lists
  for select to authenticated using (
    case when account_id is null then (select public.is_admin())
         else public.has_account_access(account_id)
              and (status <> 'draft' or (select public.current_app_role()) in ('admin', 'account_specialist')) end);
create policy price_lists_insert on public.price_lists
  for insert to authenticated with check (
    case when account_id is null then (select public.is_admin())
         else (select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id) end);
create policy price_lists_update on public.price_lists
  for update to authenticated
  using (case when account_id is null then (select public.is_admin())
              else (select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id) end)
  with check (case when account_id is null then (select public.is_admin())
              else (select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id) end);
create policy price_lists_delete on public.price_lists
  for delete to authenticated using (
    status = 'draft' and case when account_id is null then (select public.is_admin())
         else (select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id) end);

-- rows: readable when the list is readable (the subquery applies the list policy above)
create policy price_list_rows_read on public.price_list_rows
  for select to authenticated using (exists (select 1 from public.price_lists l where l.id = price_list_id));
create policy price_list_rows_insert on public.price_list_rows
  for insert to authenticated with check (
    case when account_id is null then (select public.is_admin())
         else (select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id) end);
create policy price_list_rows_update on public.price_list_rows
  for update to authenticated
  using (case when account_id is null then (select public.is_admin())
              else (select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id) end)
  with check (case when account_id is null then (select public.is_admin())
              else (select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id) end);
create policy price_list_rows_delete on public.price_list_rows
  for delete to authenticated using (
    case when account_id is null then (select public.is_admin())
         else (select public.current_app_role()) in ('admin', 'account_specialist') and public.has_account_access(account_id) end);

-- -----------------------------------------------------------------------------
-- 5. Client portal: the current approved list, prices only (never the floor or the percentages)
-- -----------------------------------------------------------------------------
create view public.portal_price_list as
select r.model, r.storage_gb, r.note, r.price_usd, r.sort_order, l.version, l.valid_from, l.valid_until
  from public.price_list_rows r
  join public.price_lists l on l.id = r.price_list_id
 where l.account_id = public.portal_account_id() and l.status = 'approved';
revoke all on public.portal_price_list from anon, public;
grant select on public.portal_price_list to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Engine inputs for one account (SOP 5.2 / 5.3), computed from the base tables.
--    Security definer so the specialist gets the totals, after an explicit access check; no base prices here.
-- -----------------------------------------------------------------------------
create function public.price_engine_inputs(p_account uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int; v_n int; v_unit numeric; v_from date; v_nth date; v_result jsonb;
begin
  if not (public.has_account_access(p_account) and public.current_app_role() in ('admin', 'account_specialist', 'bd')) then
    raise exception 'No access to this account.' using errcode = '42501';
  end if;
  select coalesce((value #>> '{}')::int, 180) into v_days from public.settings where key = 'engine_rma_window_days';
  select coalesce((value #>> '{}')::int, 5) into v_n from public.settings where key = 'engine_rma_window_orders';
  select coalesce((value #>> '{}')::numeric, 45) into v_unit from public.settings where key = 'engine_rma_unit_cost_usd';
  v_days := coalesce(v_days, 180); v_n := coalesce(v_n, 5); v_unit := coalesce(v_unit, 45);

  select o.order_date into v_nth from public.orders o
   where o.account_id = p_account and o.status >= 'invoiced'
   order by o.order_date desc, o.created_at desc offset v_n - 1 limit 1;
  v_from := least(current_date - v_days, coalesce(v_nth, current_date));

  select jsonb_build_object(
    'window_from', v_from,
    'window_days', v_days,
    'window_orders', v_n,
    'unit_return_cost_usd', v_unit,
    'orders_invoiced', (select count(*) from public.orders o where o.account_id = p_account and o.status >= 'invoiced'),
    'orders_closed', (select count(*) from public.orders o where o.account_id = p_account and o.status = 'closed'),
    'invoiced_usd', (select coalesce(sum(o.total_usd), 0) from public.orders o
                      where o.account_id = p_account and o.status >= 'invoiced' and o.order_date >= v_from),
    'credits_usd', (select coalesce(sum(u.credit_usd), 0) from public.rma_units u join public.rmas r on r.id = u.rma_id
                     where r.account_id = p_account and r.status = 'closed' and r.closed_at::date >= v_from
                       and u.resolution in ('repair_credit', 'credit_note')),
    'units_returned', (select count(*) from public.rma_units u join public.rmas r on r.id = u.rma_id
                        where r.account_id = p_account and r.status = 'closed' and r.closed_at::date >= v_from
                          and u.resolution = 'return_hk'),
    -- last 3 orders: realization (invoiced ÷ list) on the lines priced from a list, and ready → balance credited
    'recent_orders', coalesce((
      select jsonb_agg(x order by x.order_date desc) from (
        select o.number, o.order_date,
               (select sum(l.qty * l.unit_price_usd) from public.order_lines l where l.order_id = o.id and l.list_price_usd > 0) as invoiced_on_list,
               (select sum(l.qty * l.list_price_usd) from public.order_lines l where l.order_id = o.id and l.list_price_usd > 0) as list_value,
               (select min(e.created_at)::date from public.order_events e where e.order_id = o.id and e.to_status = 'ready_to_ship') as ready_on,
               (select max(p.confirmed_at)::date from public.payments p
                 where p.order_id = o.id and p.type = 'balance' and p.status = 'confirmed') as balance_on
          from public.orders o
         where o.account_id = p_account and o.status >= 'invoiced'
         order by o.order_date desc, o.created_at desc limit 3) x), '[]'::jsonb),
    -- units per month: the last 3 months
    'units_3_months', (select coalesce(sum(o.pieces), 0) from public.orders o
                        where o.account_id = p_account and o.status >= 'invoiced' and o.order_date > current_date - 91)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.price_engine_inputs(uuid) from public, anon;
grant execute on function public.price_engine_inputs(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Preparing a client list. The base prices stay admin-only, so the draft is built here (security definer):
--    the app computes RMA_c / Extra_c with the engine (SOP ch. 5) and this function prices every base row.
--    List = round(Base × (1 + (RMA_c + Extra_c) / 100), 2) · Floor = round(Base × (1 + RMA_c / 100), 2)
-- -----------------------------------------------------------------------------
-- The engine percentages the specialist's screen needs (SOP 5.6: the client sheet reads the parameters).
create function public.price_engine_params()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.current_app_role() in ('admin', 'account_specialist') then
    (select jsonb_object_agg(s.key, s.value) from public.settings s
      where s.key in ('engine_rma_floor_pct', 'engine_rma_default_pct', 'engine_rma_cap_pct', 'engine_extra_step_pct',
                      'engine_extra_max_pct', 'engine_combined_max_pct', 'engine_refresh_days'))
  end;
$$;
revoke execute on function public.price_engine_params() from public, anon;
grant execute on function public.price_engine_params() to authenticated;

create function public.price_list_reprice(p_list uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select * into l from public.price_lists where id = p_list;
  update public.price_list_rows r
     set price_usd = round(b.price_usd * (1 + (l.rma_c + l.extra_c) / 100), 2),
         floor_usd = round(b.price_usd * (1 + l.rma_c / 100), 2)
    from public.price_list_rows b
   where r.price_list_id = p_list and b.price_list_id = l.base_list_id and b.model = r.model and b.storage_gb = r.storage_gb;
end;
$$;
revoke execute on function public.price_list_reprice(uuid) from public, anon, authenticated;

create function public.price_list_create_draft(p_account uuid, p_rma numeric, p_extra numeric, p_engine jsonb, p_valid_from date default current_date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base uuid; v_id uuid; v_admin boolean := public.is_admin();
  v_floor numeric; v_cap numeric; v_max numeric; v_comb numeric;
begin
  if not (public.current_app_role() in ('admin', 'account_specialist') and public.has_account_access(p_account)) then
    raise exception 'Only an admin or an account specialist prepares a client price list.' using errcode = '42501';
  end if;
  select id into v_base from public.price_lists where account_id is null and status = 'approved';
  if v_base is null then raise exception 'There is no base list yet: the admin uploads it first.' using errcode = '23514'; end if;
  if not v_admin then -- the specialist uses the engine's result: it must stay inside the SOP rails
    select (value #>> '{}')::numeric into v_floor from public.settings where key = 'engine_rma_floor_pct';
    select (value #>> '{}')::numeric into v_cap from public.settings where key = 'engine_rma_cap_pct';
    select (value #>> '{}')::numeric into v_max from public.settings where key = 'engine_extra_max_pct';
    select (value #>> '{}')::numeric into v_comb from public.settings where key = 'engine_combined_max_pct';
    if p_rma < coalesce(v_floor, 0.5) or p_rma > coalesce(v_cap, 1.5) or p_extra < 0 or p_extra > coalesce(v_max, 2.0)
       or p_rma + p_extra > coalesce(v_comb, 3.5) then
      raise exception 'The percentages are outside the engine rails.' using errcode = '42501';
    end if;
  end if;

  delete from public.price_lists where account_id = p_account and status = 'draft';  -- one draft at a time
  insert into public.price_lists (account_id, base_list_id, rma_c, extra_c, engine, valid_from)
  values (p_account, v_base, p_rma, p_extra, coalesce(p_engine, '{}'), coalesce(p_valid_from, current_date))
  returning id into v_id;
  insert into public.price_list_rows (price_list_id, model, storage_gb, note, price_usd, floor_usd, sort_order)
  select v_id, b.model, b.storage_gb, b.note, 0, 0, b.sort_order from public.price_list_rows b where b.price_list_id = v_base;
  perform public.price_list_reprice(v_id);
  return v_id;
end;
$$;
revoke execute on function public.price_list_create_draft(uuid, numeric, numeric, jsonb, date) from public, anon;
grant execute on function public.price_list_create_draft(uuid, numeric, numeric, jsonb, date) to authenticated;

-- Admin override of the percentages on a draft (the engine's suggestion stays in `engine`).
create function public.price_list_set_percentages(p_list uuid, p_rma numeric, p_extra numeric, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can change the percentages.' using errcode = '42501'; end if;
  if p_rma < 0 or p_extra < 0 then raise exception 'Percentages cannot be negative.' using errcode = '23514'; end if;
  update public.price_lists
     set rma_c = p_rma, extra_c = p_extra,
         engine = engine || jsonb_build_object('override', jsonb_build_object('rma_c', p_rma, 'extra_c', p_extra, 'note', p_note, 'at', now()))
   where id = p_list and status = 'draft' and account_id is not null;
  if not found then raise exception 'Only a draft client list can be changed.' using errcode = '42501'; end if;
  perform public.price_list_reprice(p_list);
end;
$$;
revoke execute on function public.price_list_set_percentages(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.price_list_set_percentages(uuid, numeric, numeric, text) to authenticated;
