-- Adjustable prices per client (Gabriel, Nov 3 2026). On a DRAFT client list every row can get its own price:
--   engine_price_usd = what the engine computed (Base × (1 + RMA_c + Extra_c)); price_usd = the final price the client gets.
--   Admin and specialist adjust; the specialist never below the floor (below the floor = the SD decides, SOP 5.5) → admin only.
--   The next list is recalculated by the engine; the page shows the previous version's adjusted price beside it.
--   Colours in the app: green above Base × (1 + RMA_c + 1 %), yellow below the engine price, red below the real cost.

alter table public.price_list_rows
  add column engine_price_usd numeric(12, 2) check (engine_price_usd >= 0),
  add column adjusted_by uuid,
  add column adjusted_at timestamptz;

-- existing client lists: their price is the engine's
update public.price_list_rows set engine_price_usd = price_usd where account_id is not null and engine_price_usd is null;

-- the engine prices every row; an adjusted row keeps the price the user wrote (only the engine price and floor move)
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
         price_usd = case when r.adjusted_at is null then round(b.price_usd * (1 + (l.rma_c + l.extra_c) / 100), 2) else r.price_usd end,
         floor_usd = round(b.price_usd * (1 + l.rma_c / 100), 2)
    from public.price_list_rows b
   where r.price_list_id = p_list and b.price_list_id = l.base_list_id and b.model = r.model and b.storage_gb = r.storage_gb;
  perform set_config('hkr.reprice', 'off', true);
end;
$$;
revoke execute on function public.price_list_reprice(uuid) from public, anon, authenticated;

-- a person changing a price: stamped as adjusted (or back to the engine price = not adjusted); the specialist stays at or
-- above the floor; the engine price and floor are never typed
create function public.price_list_rows_adjust()
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
  if new.price_usd is distinct from old.price_usd then
    if new.floor_usd is not null and new.price_usd < new.floor_usd and not public.is_admin() then
      raise exception 'Below the floor (US$ %) only the admin sets the price (SOP 5.5).', new.floor_usd using errcode = '42501';
    end if;
    if new.price_usd = new.engine_price_usd then
      new.adjusted_by := null; new.adjusted_at := null;
    else
      new.adjusted_by := (select auth.uid()); new.adjusted_at := now();
    end if;
  end if;
  return new;
end;
$$;
create trigger price_list_rows_adjust
  before update on public.price_list_rows
  for each row execute function public.price_list_rows_adjust();
revoke execute on function public.price_list_rows_adjust() from public, anon, authenticated;
