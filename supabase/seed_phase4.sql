-- =============================================================================
-- HKR System — Phase 4 demo data: 3 RMAs in different states, 1 open EU batch,
-- 2 credit notes. Only touches the demo accounts (codes 9xx). Safe on the hosted
-- project; running it twice does nothing the second time.
-- Needs seed_phase3.sql (demo accounts, orders and IMEIs) first.
-- =============================================================================
do $$
declare
  v_ams uuid := (select id from public.accounts where code = 'AMS-NL-901');
  v_mex uuid := (select id from public.accounts where code = 'MEX-MX-903');
  v_gc uuid := (select id from public.intermediaries where name = 'Global Connect');
  v_mex_order uuid; v_sku uuid; v_rma uuid; v_batch uuid; v_cn uuid;
  v_imeis text[]; v_i int; v_body text; v_sum int; v_d int; v_digit int;
  v_friday date := current_date + ((5 - extract(isodow from current_date)::int + 7) % 7);
begin
  if v_ams is null or v_mex is null or exists (select 1 from public.rmas where account_id in (v_ams, v_mex)) then
    return;
  end if;

  -- MEX-MX-903 ORD-04 (closed, ~4 months ago) gets its IMEI list so its RMA can be checked.
  select o.id, (select l.sku_id from public.order_lines l where l.order_id = o.id order by l.sort_order limit 1)
    into v_mex_order, v_sku
    from public.orders o where o.account_id = v_mex and o.number = 'ORD-04';
  for v_i in 1..6 loop
    v_body := lpad((86000000000000 + v_i)::text, 14, '0');
    v_sum := 0;
    for v_d in 1..14 loop
      v_digit := substr(v_body, 15 - v_d, 1)::int;
      if v_d % 2 = 1 then v_digit := v_digit * 2; if v_digit > 9 then v_digit := v_digit - 9; end if; end if;
      v_sum := v_sum + v_digit;
    end loop;
    insert into public.imei_master (imei, sku_id, order_id, account_id, shipped_at)
    values (v_body || ((10 - v_sum % 10) % 10)::text, v_sku, v_mex_order, v_mex,
            (select order_date + 5 from public.orders where id = v_mex_order))
    on conflict (imei) do nothing;
  end loop;

  -- 1) AMS-NL-901-RMA-01: approved, 2 units returning to HK in this Friday's Global Connect batch,
  --    1 unit repair credit → credit note AMS-NL-901-CN-01 issued.
  select array_agg(imei order by imei) into v_imeis
    from public.imei_master i join public.orders o on o.id = i.order_id
   where i.account_id = v_ams and o.number = 'ORD-01';
  insert into public.rmas (account_id, status, channel, units_location, order_refs, contact_name, contact_info, client_notes,
                           submitted_at, approved_at, created_at)
  values (v_ams, 'approved', 'portal', 'at_intermediary', 'ORD-01', 'Daan Visser', 'daan@example.com',
          'Two units dead on arrival, one with a weak speaker. Please credit the speaker one.',
          now() - interval '9 days', now() - interval '6 days', now() - interval '10 days')
  returning id into v_rma;
  insert into public.rma_units (rma_id, account_id, imei, fault_category, fault_text, source, detected_on,
                                resolution, credit_fixed_usd, sort_order)
  values (v_rma, v_ams, v_imeis[1], 'No power / dead', 'Does not turn on, not even on the charger.', 'testing', current_date - 11, 'return_hk', null, 1),
         (v_rma, v_ams, v_imeis[2], 'Display (lines / spots / backlight)', 'Green vertical line after 5 minutes.', 'testing', current_date - 11, 'return_hk', null, 2),
         (v_rma, v_ams, v_imeis[3], 'Audio / microphone / speaker', 'Low volume on the bottom speaker.', 'end_customer', current_date - 12, 'repair_credit', 25, 3);
  insert into public.rma_batches (intermediary_id, cutoff_date, status, notes)
  values (v_gc, v_friday, 'open', 'Demo batch')
  on conflict (intermediary_id, cutoff_date) do nothing;
  select id into v_batch from public.rma_batches where intermediary_id = v_gc and cutoff_date = v_friday;
  update public.rma_units set unit_status = 'awaiting_shipment' where rma_id = v_rma and resolution = 'return_hk';
  update public.rma_units set batch_id = v_batch where rma_id = v_rma and resolution = 'return_hk';
  insert into public.credit_notes (account_id, rma_id, order_id, invoice_no, in_favor_of, currency, reason, applied_to,
                                   status, approved_at, issued_on)
  select v_ams, v_rma, o.id, o.hk_invoice_no, 'Amstel Refurb Trading BV', 'USD', 'Repair credit, 1 unit (speaker)',
         'next_invoice', 'issued', now() - interval '5 days', current_date - 5
    from public.orders o where o.account_id = v_ams and o.number = 'ORD-01'
  returning id into v_cn;
  insert into public.credit_note_lines (credit_note_id, description, qty, unit_price, sort_order)
  values (v_cn, 'Repair credit — speaker, IMEI ' || v_imeis[3], 1, 25, 1);
  update public.rma_units set unit_status = 'credited' where rma_id = v_rma and resolution = 'repair_credit';

  -- 2) AMS-NL-901-RMA-02: received through the portal, waiting for verification:
  --    2 units OURS (one swollen battery) + 1 IMEI that is NOT in our records.
  select array_agg(imei order by imei) into v_imeis
    from public.imei_master i join public.orders o on o.id = i.order_id
   where i.account_id = v_ams and o.number = 'ORD-02';
  insert into public.rmas (account_id, status, channel, units_location, order_refs, contact_name, contact_info, client_notes,
                           submitted_at, created_at)
  values (v_ams, 'form_received', 'portal', 'with_client', 'ORD-02', 'Daan Visser', 'daan@example.com',
          'Found at reception testing.', now() - interval '1 day', now() - interval '1 day')
  returning id into v_rma;
  insert into public.rma_units (rma_id, account_id, imei, fault_category, fault_text, source, detected_on, battery_swollen, sort_order)
  values (v_rma, v_ams, v_imeis[1], 'Face ID / Touch ID', 'Face ID not available.', 'testing', current_date - 2, false, 1),
         (v_rma, v_ams, v_imeis[2], 'Battery / charging', 'Battery swollen, back glass lifting.', 'testing', current_date - 2, true, 2),
         (v_rma, v_ams, '490154203237518', 'Camera', 'Rear camera blurry.', 'testing', current_date - 2, false, 3);

  -- 3) MEX-MX-903-RMA-01: LATAM (return impractical) → repair credit on 4 units; verified and
  --    waiting for the admin's approval; the credit (US$ 150 each) is ABOVE the 1 % cap.
  select array_agg(imei order by imei) into v_imeis from public.imei_master where order_id = v_mex_order;
  insert into public.rmas (account_id, status, channel, units_location, order_refs, contact_name, contact_info, client_notes,
                           internal_notes, submitted_at, created_at)
  values (v_mex, 'verified', 'import', 'at_end_customer', 'ORD-04', 'Carlos Ramírez', 'carlos@example.com',
          'Equipos devueltos por clientes finales, piden crédito de reparación.',
          'Form imported from xlsx; evidence received by WhatsApp.', now() - interval '3 days', now() - interval '4 days')
  returning id into v_rma;
  insert into public.rma_units (rma_id, account_id, imei, fault_category, fault_text, source, detected_on, resolution, credit_fixed_usd, unit_status, sort_order)
  values (v_rma, v_mex, v_imeis[1], 'Screen / touch', 'Touch no responde en la parte superior.', 'end_customer', current_date - 6, 'repair_credit', 150, 'verified', 1),
         (v_rma, v_mex, v_imeis[2], 'Screen / touch', 'Ghost touch.', 'end_customer', current_date - 6, 'repair_credit', 150, 'verified', 2),
         (v_rma, v_mex, v_imeis[3], 'Battery / charging', 'No carga con cable original.', 'end_customer', current_date - 5, 'repair_credit', 150, 'verified', 3),
         (v_rma, v_mex, v_imeis[4], 'SIM / network / signal', 'Sin señal con dos SIM distintas.', 'end_customer', current_date - 5, 'repair_credit', 150, 'verified', 4);
  insert into public.credit_notes (account_id, rma_id, order_id, invoice_no, in_favor_of, currency, reason, applied_to)
  select v_mex, v_rma, o.id, o.hk_invoice_no, 'Mexicell Distribuciones SA de CV', 'USD', 'Repair credit, 4 units', 'next_invoice'
    from public.orders o where o.id = v_mex_order
  returning id into v_cn;
  insert into public.credit_note_lines (credit_note_id, description, qty, unit_price, sort_order)
  values (v_cn, 'Repair credit — screen / battery / signal (4 units)', 4, 150, 1);
end $$;
