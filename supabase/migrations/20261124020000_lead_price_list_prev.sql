-- Lead price list with the previous price (Gabriel, Nov 24 2026): every output marks ▼ green / ▲ red against the previous
-- version of the list. For leads that is the PREVIOUS base version × (1 + the same lead %). prev_version null = no previous
-- base (no marks); prev_price_usd null with a prev_version = a model that is new in this base.
drop function if exists public.lead_price_list(public.product_brand);

create function public.lead_price_list(p_brand public.product_brand)
returns table (model text, storage_gb int, note text, price_usd numeric, sort_order int, base_version int, valid_from date,
               prev_price_usd numeric, prev_version int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pct numeric;
  v_cur public.price_lists;
  v_prev public.price_lists;
begin
  if not (public.is_admin() or (public.current_app_role() = 'bd' and public.has_section('price-lists'))) then
    raise exception 'Only the admin and the BD team get the lead price list.' using errcode = '42501';
  end if;
  select coalesce((s.value #>> '{}')::numeric, 0) into v_pct from public.settings s where s.key = 'lead_list_extra_pct';
  v_pct := coalesce(v_pct, 0);
  select * into v_cur from public.price_lists l where l.account_id is null and l.status = 'approved' and l.brand = p_brand;
  if v_cur.id is null then return; end if;
  select * into v_prev from public.price_lists l
   where l.account_id is null and l.brand = p_brand and l.status <> 'draft' and l.version < v_cur.version
   order by l.version desc limit 1;
  return query
    select r.model, r.storage_gb, r.note, round(r.price_usd * (1 + v_pct / 100), 2), r.sort_order, v_cur.version, v_cur.valid_from,
           (select round(p.price_usd * (1 + v_pct / 100), 2) from public.price_list_rows p
             where p.price_list_id = v_prev.id and p.model = r.model and p.storage_gb = r.storage_gb),
           v_prev.version
      from public.price_list_rows r
     where r.price_list_id = v_cur.id
     order by r.sort_order, r.model, r.storage_gb;
end;
$$;
revoke execute on function public.lead_price_list(public.product_brand) from public, anon;
grant execute on function public.lead_price_list(public.product_brand) to authenticated;
