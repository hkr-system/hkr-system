-- Client price rules (Gabriel, Nov 3 2026): a fixed US$ increment per model + GB for one client, remembered across lists.
--   New list: a model with a rule → new base + increment; a model without a rule → the engine (Base × (1 + RMA_c + Extra_c)).
--   Every row priced by a rule shows the amount to verify (base + rule = price, vs the engine and the previous price).
--   Admin and specialist create / change rules. A model that leaves the base leaves the list (discontinued); its rule stays
--   saved and shows "Discontinued" until someone deletes it (it applies again if the model comes back).

create table public.account_price_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  model text not null,
  storage_gb integer not null,
  increment_usd numeric(12, 2) not null,
  note text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  unique (account_id, model, storage_gb)
);
select public.setup_table('public.account_price_rules');

create policy account_price_rules_select on public.account_price_rules for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'account_specialist') and (select public.has_account_access(account_id)));
create policy account_price_rules_insert on public.account_price_rules for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'account_specialist') and (select public.has_account_access(account_id)));
create policy account_price_rules_update on public.account_price_rules for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'account_specialist') and (select public.has_account_access(account_id)))
  with check ((select public.current_app_role()) in ('admin', 'account_specialist') and (select public.has_account_access(account_id)));
create policy account_price_rules_delete on public.account_price_rules for delete to authenticated
  using ((select public.current_app_role()) in ('admin', 'account_specialist') and (select public.has_account_access(account_id)));

-- which rule priced a row (null = engine or typed by hand)
alter table public.price_list_rows
  add column rule_increment_usd numeric(12, 2),
  add column rule_price_usd numeric(12, 2);

-- the engine prices every row; a client rule replaces the engine price of its model; a typed price is kept
create or replace function public.price_list_reprice(p_list uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select * into l from public.price_lists where id = p_list;
  perform set_config('hkr.reprice', 'on', true);
  update public.price_list_rows r
     set engine_price_usd = round(b.price_usd * (1 + (l.rma_c + l.extra_c) / 100), 2),
         rule_increment_usd = x.increment_usd,
         rule_price_usd = case when x.id is null then null else round(b.price_usd + x.increment_usd, 2) end,
         price_usd = case
           when r.adjusted_at is not null then r.price_usd
           when x.id is not null then greatest(round(b.price_usd + x.increment_usd, 2), 0)
           else round(b.price_usd * (1 + (l.rma_c + l.extra_c) / 100), 2) end,
         floor_usd = round(b.price_usd * (1 + l.rma_c / 100), 2)
    from public.price_list_rows b
    left join public.account_price_rules x on x.account_id = l.account_id and x.model = b.model and x.storage_gb = b.storage_gb
   where r.price_list_id = p_list and b.price_list_id = l.base_list_id and b.model = r.model and b.storage_gb = r.storage_gb;
  update public.account_price_rules x set last_used_at = now()
    from public.price_list_rows r
   where r.price_list_id = p_list and x.account_id = l.account_id and x.model = r.model and x.storage_gb = r.storage_gb;
  perform set_config('hkr.reprice', 'off', true);
end;
$$;
revoke execute on function public.price_list_reprice(uuid) from public, anon, authenticated;

-- a typed price: back to the automatic price (rule, else engine) = not adjusted
create or replace function public.price_list_rows_adjust()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('hkr.reprice', true), '') = 'on' or (select auth.uid()) is null or new.account_id is null then
    return new;
  end if;
  new.engine_price_usd := old.engine_price_usd;
  new.floor_usd := old.floor_usd;
  new.rule_increment_usd := old.rule_increment_usd;
  new.rule_price_usd := old.rule_price_usd;
  if new.price_usd is distinct from old.price_usd then
    if new.floor_usd is not null and new.price_usd < new.floor_usd and not public.is_admin() then
      raise exception 'Below the floor (US$ %) only the admin sets the price (SOP 5.5).', new.floor_usd using errcode = '42501';
    end if;
    if new.price_usd = coalesce(new.rule_price_usd, new.engine_price_usd) then
      new.adjusted_by := null; new.adjusted_at := null;
    else
      new.adjusted_by := (select auth.uid()); new.adjusted_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.price_list_rows_adjust() from public, anon, authenticated;

-- "Remember for this client": the row's price − its base price becomes the client's rule for that model + GB
create function public.price_rule_remember(p_row uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record; v_base numeric; v_inc numeric;
begin
  select pr.*, l.account_id as acc, l.base_list_id, l.status into r
    from public.price_list_rows pr join public.price_lists l on l.id = pr.price_list_id where pr.id = p_row;
  if r is null or r.acc is null then raise exception 'Price row not found.' using errcode = '23514'; end if;
  if not (public.current_app_role() in ('admin', 'account_specialist') and public.has_account_access(r.acc)) then
    raise exception 'Only an admin or an account specialist sets client price rules.' using errcode = '42501';
  end if;
  select price_usd into v_base from public.price_list_rows
   where price_list_id = r.base_list_id and model = r.model and storage_gb = r.storage_gb;
  if v_base is null then raise exception 'This model is not in the base list.' using errcode = '23514'; end if;
  v_inc := round(r.price_usd - v_base, 2);
  insert into public.account_price_rules (account_id, model, storage_gb, increment_usd, last_used_at)
  values (r.acc, r.model, r.storage_gb, v_inc, now())
  on conflict (account_id, model, storage_gb) do update set increment_usd = excluded.increment_usd, last_used_at = now();
  if r.status = 'draft' then -- the row now follows the rule
    perform set_config('hkr.reprice', 'on', true);
    update public.price_list_rows set rule_increment_usd = v_inc, rule_price_usd = price_usd, adjusted_at = null, adjusted_by = null
     where id = p_row;
    perform set_config('hkr.reprice', 'off', true);
  end if;
  return v_inc;
end;
$$;
revoke execute on function public.price_rule_remember(uuid) from public, anon;
grant execute on function public.price_rule_remember(uuid) to authenticated;

-- rules of a client with "in the current base?" (the base itself stays admin-only)
create function public.price_rules_for(p_account uuid)
returns table (id uuid, model text, storage_gb integer, increment_usd numeric, note text, last_used_at timestamptz,
               updated_at timestamptz, in_base boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select x.id, x.model, x.storage_gb, x.increment_usd, x.note, x.last_used_at, x.updated_at,
         exists (select 1 from public.price_list_rows b join public.price_lists bl on bl.id = b.price_list_id
                  where bl.account_id is null and bl.status = 'approved' and b.model = x.model and b.storage_gb = x.storage_gb)
    from public.account_price_rules x
   where x.account_id = p_account
     and public.current_app_role() in ('admin', 'account_specialist') and public.has_account_access(p_account)
   order by x.model, x.storage_gb;
$$;
revoke execute on function public.price_rules_for(uuid) from public, anon;
grant execute on function public.price_rules_for(uuid) to authenticated;
