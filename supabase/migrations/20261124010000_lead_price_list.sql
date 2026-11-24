-- Price list for LEADS (Gabriel, Nov 24 2026): a list with no client name, NO RMA amortization, only an extra margin % over
-- the base. Price lists page → card "Lead price list" (iPhone / Samsung), in USD (FOB Hong Kong) or EUR door to door via a
-- company. Admin and bd download it; only the admin sees and changes the extra % (setting lead_list_extra_pct, confidential).
-- The base stays admin-only: the bd gets the prices through the security-definer rpc below, never the base rows.

insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('lead_list_extra_pct', 'engine', 'Lead price list: extra margin %', '0', true, 180,
   'Price list for leads = base × (1 + this %). No RMA amortization. At 0 % the lead list equals the base list.')
on conflict (key) do nothing;

-- The lead list of a brand: every row of the approved base × (1 + lead_list_extra_pct %), rounded to the cent.
create function public.lead_price_list(p_brand public.product_brand)
returns table (model text, storage_gb int, note text, price_usd numeric, sort_order int, base_version int, valid_from date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pct numeric;
begin
  if not (public.is_admin() or (public.current_app_role() = 'bd' and public.has_section('price-lists'))) then
    raise exception 'Only the admin and the BD team get the lead price list.' using errcode = '42501';
  end if;
  select coalesce((s.value #>> '{}')::numeric, 0) into v_pct from public.settings s where s.key = 'lead_list_extra_pct';
  v_pct := coalesce(v_pct, 0);
  return query
    select r.model, r.storage_gb, r.note, round(r.price_usd * (1 + v_pct / 100), 2), r.sort_order, l.version, l.valid_from
      from public.price_lists l
      join public.price_list_rows r on r.price_list_id = l.id
     where l.account_id is null and l.status = 'approved' and l.brand = p_brand
     order by r.sort_order, r.model, r.storage_gb;
end;
$$;
revoke execute on function public.lead_price_list(public.product_brand) from public, anon;
grant execute on function public.lead_price_list(public.product_brand) to authenticated;
