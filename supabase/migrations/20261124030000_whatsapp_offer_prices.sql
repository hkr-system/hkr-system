-- WhatsApp → Offers (Gabriel, Nov 24 2026): a "Special Volume Deal" broadcast text built from the CURRENT base list with no
-- extra margin, picking the models whose price dropped most against the previous base. Admin and bd with the WhatsApp module
-- (Gabriel asked for the base price itself); the base rows stay admin-only — this rpc returns only what the offer needs.
create function public.offer_base_prices(p_brand public.product_brand)
returns table (model text, storage_gb int, note text, price_usd numeric, prev_price_usd numeric, base_version int,
               prev_version int, valid_from date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cur public.price_lists;
  v_prev public.price_lists;
begin
  if not (public.is_admin() or (public.current_app_role() = 'bd' and public.has_section('whatsapp'))) then
    raise exception 'Only the admin and the BD team prepare offers.' using errcode = '42501';
  end if;
  select * into v_cur from public.price_lists l where l.account_id is null and l.status = 'approved' and l.brand = p_brand;
  if v_cur.id is null then return; end if;
  select * into v_prev from public.price_lists l
   where l.account_id is null and l.brand = p_brand and l.status <> 'draft' and l.version < v_cur.version
   order by l.version desc limit 1;
  return query
    select r.model, r.storage_gb, r.note, r.price_usd,
           (select p.price_usd from public.price_list_rows p where p.price_list_id = v_prev.id and p.model = r.model and p.storage_gb = r.storage_gb),
           v_cur.version, v_prev.version, v_cur.valid_from
      from public.price_list_rows r
     where r.price_list_id = v_cur.id
     order by r.sort_order, r.model, r.storage_gb;
end;
$$;
revoke execute on function public.offer_base_prices(public.product_brand) from public, anon;
grant execute on function public.offer_base_prices(public.product_brand) to authenticated;
