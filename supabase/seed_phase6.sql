-- Phase 6 demo: a DEMO base list (invented round prices — never real HKR prices in this public repo),
-- an approved list for AMS-NL-901 and a draft for BER-DE-902. Safe on the hosted project, but not needed there:
-- Gabriel uploads the real base list in the app.
do $$
declare
  v_base uuid; v_ams uuid; v_ber uuid; v_l uuid;
begin
  if exists (select 1 from public.price_lists) then return; end if;
  insert into public.price_lists (account_id, valid_from, note, source_file)
  values (null, current_date - 3, 'Demo base list (invented prices)', 'demo') returning id into v_base;
  insert into public.price_list_rows (price_list_id, model, storage_gb, note, price_usd, sort_order)
  select v_base, m, gb, n, p, row_number() over () from (values
    ('iPhone 13', 128, null, 270.00), ('iPhone 13', 256, null, 290.00),
    ('iPhone 13 Pro', 128, null, 370.00), ('iPhone 13 Pro Max', 256, null, 465.00),
    ('iPhone 14', 128, 'esim+regular sim', 290.00), ('iPhone 14 Pro', 256, 'esim+regular sim', 455.00),
    ('iPhone 15', 128, 'esim+regular sim', 395.00), ('iPhone 15', 256, 'esim+regular sim', 450.00),
    ('iPhone 15 Pro Max', 256, 'esim+regular sim', 630.00),
    ('iPhone 16', 128, 'esim+regular sim', 545.00), ('iPhone 16 Pro', 256, 'esim+regular sim', 700.00),
    ('iPhone 16 Pro Max', 256, 'esim+regular sim', 745.00)
  ) as t(m, gb, n, p);
  update public.price_lists set status = 'approved' where id = v_base;

  select id into v_ams from public.accounts where code = 'AMS-NL-901';
  select id into v_ber from public.accounts where code = 'BER-DE-902';
  if v_ams is null then return; end if;

  -- AMS: approved list 6 days ago (RMA 1.0 % default, Extra 1.0 % default)
  insert into public.price_lists (account_id, base_list_id, rma_c, extra_c, valid_from, engine)
  values (v_ams, v_base, 1.0, 1.0, current_date - 6,
          '{"demo": true, "rma": {"case": "default", "value": 1.0}, "extra": {"case": "default", "value": 1.0}}')
  returning id into v_l;
  insert into public.price_list_rows (price_list_id, model, storage_gb, note, price_usd, floor_usd, sort_order)
  select v_l, model, storage_gb, note, 0, 0, sort_order from public.price_list_rows where price_list_id = v_base;
  perform public.price_list_reprice(v_l);
  update public.price_lists set status = 'approved' where id = v_l;

  -- BER: a draft waiting for the admin
  if v_ber is not null then
    insert into public.price_lists (account_id, base_list_id, rma_c, extra_c, engine)
    values (v_ber, v_base, 1.4, 0.5, '{"demo": true}') returning id into v_l;
    insert into public.price_list_rows (price_list_id, model, storage_gb, note, price_usd, floor_usd, sort_order)
    select v_l, model, storage_gb, note, 0, 0, sort_order from public.price_list_rows where price_list_id = v_base;
    perform public.price_list_reprice(v_l);
  end if;
end $$;
