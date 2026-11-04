-- Samsung demo (Nov 4 2026): a DEMO Samsung base list with INVENTED round prices (never real HKR prices in this public
-- repo) and an approved Samsung list for AMS-NL-901, next to its iPhone list. Local only; Gabriel uploads the real file.
do $$
declare
  v_base uuid; v_ams uuid; v_l uuid;
begin
  if exists (select 1 from public.price_lists where brand = 'samsung') then return; end if;
  insert into public.price_lists (account_id, brand, valid_from, note, source_file)
  values (null, 'samsung', current_date - 3, 'Demo Samsung base list (invented prices)', 'demo') returning id into v_base;
  insert into public.price_list_rows (price_list_id, model, storage_gb, note, price_usd, sort_order)
  select v_base, m, gb, n, p, row_number() over () from (values
    ('S22', 128, null, 150.00), ('S22 Ultra', 128, null, 250.00),
    ('S23', 128, null, 200.00), ('S23 Ultra', 256, null, 350.00),
    ('S24', 128, 'S921U', 300.00), ('S24 Ultra', 256, 'S928U', 450.00),
    ('S25', 128, null, 400.00), ('S25 Ultra', 256, null, 600.00)
  ) as t(m, gb, n, p);
  update public.price_lists set status = 'approved' where id = v_base;

  select id into v_ams from public.accounts where code = 'AMS-NL-901';
  if v_ams is null then return; end if;
  insert into public.price_lists (account_id, brand, base_list_id, rma_c, extra_c, valid_from, engine)
  values (v_ams, 'samsung', v_base, 1.0, 1.0, current_date - 6,
          '{"demo": true, "rma": {"case": "default", "value": 1.0}, "extra": {"case": "default", "value": 1.0}}')
  returning id into v_l;
  insert into public.price_list_rows (price_list_id, model, storage_gb, note, price_usd, floor_usd, sort_order)
  select v_l, model, storage_gb, note, 0, 0, sort_order from public.price_list_rows where price_list_id = v_base;
  perform public.price_list_reprice(v_l);
  update public.price_lists set status = 'approved' where id = v_l;
end $$;
