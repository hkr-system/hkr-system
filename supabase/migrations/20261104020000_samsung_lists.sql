-- Samsung price lists (Gabriel, Nov 4 2026). HKR also sells Samsung (file "Samsung_US_version", same layout as
-- iPhonePrices: model · GB · USD, already at the base margin).
--   * One approved BASE list per brand and one approved client list per account AND brand: a client that buys both gets
--     two separate lists (iPhone and Samsung). They never replace each other.
--   * Same engine: the client's RMA_c and Extra_c are computed the same way for both lists; prices stay editable per row
--     and the client's price rules apply (Nov 3 2026), exactly as on iPhone lists.
--   * Model names stay as in Samsung's file ("S24 Ultra", "NOTE 20 U 5G"; the model code S928U is kept as the note).
--   * Battery options and CE marks never apply to Samsung lines (Gabriel): refused here, hidden in the order form.

create type public.product_brand as enum ('iphone', 'samsung');

alter table public.price_lists add column brand public.product_brand not null default 'iphone';

drop index public.price_lists_one_approved;
create unique index price_lists_one_approved on public.price_lists
  (coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), brand) where status = 'approved';
create index price_lists_brand_idx on public.price_lists (account_id, brand, version desc);

-- iPhone or Samsung from the model name: every iPhone model is stored as "iPhone …" (base list reader, SKUs).
create function public.brand_of(p_model text)
returns public.product_brand
language sql
immutable
set search_path = ''
as $$
  select case when p_model is null or btrim(p_model) = '' then null
              when p_model ~* '^\s*iphone' then 'iphone'
              else 'samsung' end::public.product_brand;
$$;

-- Versions, approval and superseding are counted per account AND brand.
create or replace function public.price_lists_before_write()
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
    if new.base_list_id is not null
       and not exists (select 1 from public.price_lists b where b.id = new.base_list_id and b.brand = new.brand and b.account_id is null) then
      raise exception 'A client list is built on the base list of the same brand.' using errcode = '23514';
    end if;
    select coalesce(max(version), 0) + 1 into new.version from public.price_lists
     where account_id is not distinct from new.account_id and brand = new.brand;
    if new.account_id is not null and new.valid_until is null then
      select coalesce((value #>> '{}')::int, 14) into v_days from public.settings where key = 'engine_refresh_days';
      new.valid_until := new.valid_from + coalesce(v_days, 14);
    end if;
    return new;
  end if;

  if new.account_id is distinct from old.account_id or new.version is distinct from old.version or new.brand is distinct from old.brand then
    raise exception 'A price list keeps its account, brand and version.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' and old.status = 'draft' then
      if not v_admin then raise exception 'Only an admin can approve a price list.' using errcode = '42501'; end if;
      if not exists (select 1 from public.price_list_rows r where r.price_list_id = new.id) then
        raise exception 'The list has no prices.' using errcode = '23514';
      end if;
      update public.price_lists set status = 'superseded'
       where account_id is not distinct from new.account_id and brand = new.brand and status = 'approved' and id <> new.id;
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
    raise exception 'Only an admin can change the percentages.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Preparing a client list now names the brand (default iPhone, as before). One draft per account AND brand.
drop function public.price_list_create_draft(uuid, numeric, numeric, jsonb, date);
create function public.price_list_create_draft(p_account uuid, p_rma numeric, p_extra numeric, p_engine jsonb,
  p_valid_from date default current_date, p_brand public.product_brand default 'iphone')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base uuid; v_id uuid; v_admin boolean := public.is_admin();
  v_floor numeric; v_cap numeric; v_max numeric; v_comb numeric;
  v_brand public.product_brand := coalesce(p_brand, 'iphone');
begin
  if not (public.current_app_role() in ('admin', 'account_specialist') and public.has_account_access(p_account)) then
    raise exception 'Only an admin or an account specialist prepares a client price list.' using errcode = '42501';
  end if;
  select id into v_base from public.price_lists where account_id is null and brand = v_brand and status = 'approved';
  if v_base is null then
    raise exception 'There is no % base list yet: the admin uploads it first.', case when v_brand = 'samsung' then 'Samsung' else 'iPhone' end
      using errcode = '23514';
  end if;
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

  delete from public.price_lists where account_id = p_account and brand = v_brand and status = 'draft';  -- one draft at a time
  insert into public.price_lists (account_id, brand, base_list_id, rma_c, extra_c, engine, valid_from)
  values (p_account, v_brand, v_base, p_rma, p_extra, coalesce(p_engine, '{}'), coalesce(p_valid_from, current_date))
  returning id into v_id;
  insert into public.price_list_rows (price_list_id, model, storage_gb, note, price_usd, floor_usd, sort_order)
  select v_id, b.model, b.storage_gb, b.note, 0, 0, b.sort_order from public.price_list_rows b where b.price_list_id = v_base;
  perform public.price_list_reprice(v_id);
  return v_id;
end;
$$;
revoke execute on function public.price_list_create_draft(uuid, numeric, numeric, jsonb, date, public.product_brand) from public, anon;
grant execute on function public.price_list_create_draft(uuid, numeric, numeric, jsonb, date, public.product_brand) to authenticated;

-- Order lines: battery options and CE marks are iPhone only.
create or replace function public.order_lines_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum int; v_model text;
begin
  -- a SKU line fills model + GB from the SKU (old lines, imports)
  if new.sku_id is not null and new.model is null then
    select s.model, s.storage_gb into new.model, new.storage_gb from public.skus s where s.id = new.sku_id;
  end if;
  v_model := coalesce(new.model, '');
  -- battery_new (older code, imports) and battery_option stay in step; the option wins when both change
  if tg_op = 'INSERT' and new.battery_option = 'new' and not new.battery_new then
    new.battery_option := null;               -- written without an option and without new batteries
  elsif tg_op = 'UPDATE' and new.battery_option is not distinct from old.battery_option
        and new.battery_new is distinct from old.battery_new then
    new.battery_option := case when new.battery_new then 'new' end;
  end if;
  new.battery_new := coalesce(new.battery_option = 'new', false);
  if public.brand_of(new.model) = 'samsung' and (new.battery_option is not null or new.ce_marked) then
    raise exception 'Battery options and CE marks do not apply to Samsung (%).', v_model using errcode = '23514';
  end if;
  if new.battery_option = 'bh80' and coalesce(substring(v_model from '(\d{2})')::int, 0) < 14 then
    raise exception '80%%+ BH is only for iPhone 14 and newer (%).', v_model using errcode = '23514';
  end if;
  if jsonb_typeof(new.colors) <> 'array' then
    raise exception 'Colours must be a list.' using errcode = '23514';
  end if;
  if new.colors_mixed then
    new.colors := '[]';
  elsif jsonb_array_length(new.colors) > 0 then
    select coalesce(sum((c ->> 'qty')::int), 0) into v_sum from jsonb_array_elements(new.colors) c;
    if v_sum <> new.qty then
      raise exception 'The colours add up to % but the line has % units.', v_sum, new.qty using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Samsung SKUs never carry the separate battery line.
update public.skus set battery_eligible = false where public.brand_of(model) = 'samsung' and battery_eligible;

-- Client portal: both current lists, with their brand (column added at the end of the view).
create or replace view public.portal_price_list as
select r.model, r.storage_gb, r.note, r.price_usd, r.sort_order, l.version, l.valid_from, l.valid_until, l.brand
  from public.price_list_rows r
  join public.price_lists l on l.id = r.price_list_id
 where l.account_id = public.portal_account_id() and l.status = 'approved';
