-- =============================================================================
-- HKR System — Phase 3 demo data (accounts, contacts, orders, payments, IMEIs).
-- Safe on the hosted project: demo accounts use codes 9xx (is_demo = true), example.com
-- emails, fake phones and demo prices; running it twice does nothing the second time.
-- Needs the demo users (gabriel/yessica/atreyi .demo@) for the owner assignments.
-- =============================================================================

-- 6. Phase 3 demo accounts (codes 9xx = demo; real client codes start from 001 and the 9xx
--    numbers never move the real sequence). One per invoicing route of brief §6.
insert into public.accounts (code, name, legal_name, country, market, billing_entity, intermediary_id, currency,
  payment_method, delivery_setup, invoice_format, status, language, notes, is_demo)
values
  ('AMS-NL-901', 'Amstel Refurb Trading (demo)', 'Amstel Refurb Trading BV', 'NL', 'EU', 'ever_state',
   (select id from public.intermediaries where name = 'Global Connect'), 'EUR', 'wire', 'client_label',
   '{"battery_line_separate": true, "show_ce_text": true, "show_note": false}', 'active', 'en',
   'Route B: invoiced through Global Connect (EUR). Client labels. Orders confirmed by Daan.', true),
  ('BER-DE-902', 'Berlin Phone Depot (demo)', 'Berlin Phone Depot GmbH', 'DE', 'EU', 'ever_state', null, 'USD',
   'wire', 'our_booking', '{"battery_line_separate": false, "show_ce_text": true, "show_note": false}', 'active', 'en',
   'EU direct, USD wire. We book the courier (freight recharged). Battery absorbed in the unit price.', true),
  ('MEX-MX-903', 'Mexicell Distribuciones (demo)', 'Mexicell Distribuciones SA de CV', 'MX', 'LATAM', 'ever_state', null,
   'USD', 'usdt', 'client_label', '{"battery_line_separate": true, "show_ce_text": false, "show_note": false}', 'active', 'es',
   'LATAM, pays USDT TRC-20 (0.85 % fee line). Miami forwarder labels.', true),
  ('MIA-US-904', 'Miami Wireless Hub (demo)', 'Miami Wireless Hub LLC', 'US', 'US', 'streamline_fze', null, 'USD',
   'wire', 'client_label', '{"battery_line_separate": true, "show_ce_text": false, "show_note": true}', 'onboarding', 'en',
   'Invoiced through Streamline Smartphone Distribution FZE.', true)
on conflict (code) do nothing;

insert into public.account_assignments (account_id, user_id, role_on_account)
select a.id, p.user_id, x.role::public.account_role
  from (values ('AMS-NL-901', 'yessica.demo@hk-refurbished-stock.com', 'owner'),
               ('MEX-MX-903', 'yessica.demo@hk-refurbished-stock.com', 'owner'),
               ('BER-DE-902', 'gabriel.demo@hk-refurbished-stock.com', 'owner'),
               ('MIA-US-904', 'gabriel.demo@hk-refurbished-stock.com', 'owner'),
               ('AMS-NL-901', 'atreyi.demo@hk-refurbished-stock.com', 'specialist'),
               ('BER-DE-902', 'atreyi.demo@hk-refurbished-stock.com', 'specialist'),
               ('MEX-MX-903', 'atreyi.demo@hk-refurbished-stock.com', 'specialist'),
               ('MIA-US-904', 'atreyi.demo@hk-refurbished-stock.com', 'specialist')) as x(code, email, role)
  join public.accounts a on a.code = x.code
  join public.profiles p on p.email = x.email
on conflict do nothing;

insert into public.contacts (account_id, name, role, phone_e164, email, language, whatsapp_opt_in)
select a.id, x.name, x.role, x.phone, x.email, x.lang, true
  from (values ('AMS-NL-901', 'Daan Visser', 'Confirms orders', '+31611990001', 'daan@example.com', 'en'),
               ('AMS-NL-901', 'Eva Jansen', 'Confirms payments', '+31611990002', 'eva@example.com', 'en'),
               ('BER-DE-902', 'Lukas Weber', 'Owner', '+4915119900003', 'lukas@example.com', 'en'),
               ('MEX-MX-903', 'Carlos Ramírez', 'Compras', '+525511990004', 'carlos@example.com', 'es'),
               ('MIA-US-904', 'Mike Johnson', 'Purchasing', '+13055990005', 'mike@example.com', 'en')) as x(code, name, role, phone, email, lang)
  join public.accounts a on a.code = x.code
 where not exists (select 1 from public.contacts c where c.account_id = a.id and c.email = x.email);

-- 7. Twelve demo orders across the lifecycle, with payments and IMEIs (Phase 3).
do $$
declare
  v_acc uuid; v_order uuid; v_line uuid; r record; l text; i int; v_imei text; v_amount numeric;
  v_sku13 uuid := (select id from public.skus where model = 'iPhone 13' and storage_gb = 128 limit 1);
  v_sku14 uuid := (select id from public.skus where model = 'iPhone 14 Pro' and storage_gb = 256 limit 1);
  v_sku15 uuid := (select id from public.skus where model = 'iPhone 15' and storage_gb = 128 limit 1);
  v_sku16 uuid := (select id from public.skus where model = 'iPhone 16' and storage_gb = 128 limit 1);
  v_imei_seq bigint := 35000000000000;
begin
  if exists (select 1 from public.orders o join public.accounts a on a.id = o.account_id where a.is_demo) then
    return; -- already seeded
  end if;
  -- Luhn check digit for demo IMEIs (14 digits + 1)
  create or replace function pg_temp.luhn(p text) returns text language plpgsql as $f$
  declare s int := 0; d int; k int;
  begin
    for k in 1..14 loop
      d := substr(p, 15 - k, 1)::int;
      if k % 2 = 1 then d := d * 2; if d > 9 then d := d - 9; end if; end if;
      s := s + d;
    end loop;
    return p || ((10 - s % 10) % 10)::text;
  end $f$;

  for r in
    select * from (values
      -- code, status, days ago, partner EUR, lines "sku|qty|price|battery|batt_unit", payments "type|amount|confirmed", imeis, tracking, courier, eta in days
      ('AMS-NL-901', 'closed',         95, 41500.00::numeric, array['13|200|142|1|8', '14|100|118|1|10'], array['deposit|auto|1', 'balance|auto|1'], 12, 'DHL 4471820051', 'DHL', -80),
      ('AMS-NL-901', 'shipped',        30, 33400.00,          array['15|150|182|1|10', '13|50|142|1|8'],  array['deposit|auto|1', 'balance|auto|1'], 10, 'DHL 4471820099', 'DHL', -10),
      ('AMS-NL-901', 'ready_to_ship',  14, 29800.00,          array['14|120|265|1|10'],                  array['deposit|auto|1'],                   0,  null, null, 1),
      ('BER-DE-902', 'delivered',      60, null,              array['13|180|150|0|0'],                   array['deposit|auto|1', 'balance|auto|1'], 8, 'UPS 1Z999AA10', 'UPS', -45),
      ('BER-DE-902', 'in_preparation', 10, null,              array['15|130|190|0|0'],                   array['deposit|auto|1'],                   0,  null, null, 6),
      ('BER-DE-902', 'invoiced',        3, null,              array['16|110|240|0|0'],                   array[]::text[],                           0,  null, null, null),
      ('MEX-MX-903', 'balance_paid',   20, null,              array['13|150|141|1|8', '15|60|183|1|10'], array['deposit|auto|1', 'balance|auto|1'], 6, null, null, -2),
      ('MEX-MX-903', 'deposit_paid',    7, null,              array['14|90|262|1|10'],                   array['deposit|auto|1'],                   0,  null, null, 10),
      ('MEX-MX-903', 'quoted',          1, null,              array['16|100|238|1|10'],                  array[]::text[],                           0,  null, null, null),
      ('MIA-US-904', 'shipped',        25, null,              array['13|160|143|1|8'],                   array['deposit|auto|1', 'balance|auto|1'], 8, 'FedEx 7712 3456 7890', 'FedEx', -8),
      ('MIA-US-904', 'invoiced',        2, null,              array['14|250|268|1|10'],                  array['deposit|short:36.37|0'],                   0,  null, null, null),
      ('MIA-US-904', 'quoted',          0, null,              array['15|120|185|1|10'],                  array[]::text[],                           0,  null, null, null)
    ) as t(code, status, days_ago, eur, lines, pays, imeis, tracking, courier, eta)
  loop
    v_acc := (select id from public.accounts where code = r.code);
    insert into public.orders (account_id, status, order_date, payment_method, delivery_setup, partner_invoice_eur,
                               partner_invoice_no, hk_invoice_no, eta_date, tracking, courier, ship_date, delivered_date,
                               freight_usd, ship_to)
    select v_acc, r.status::public.order_status, current_date - r.days_ago, a.payment_method, a.delivery_setup, r.eur,
           case when r.eur is not null then 'GC-' || to_char(current_date - r.days_ago, 'YYMMDD') end,
           case when r.status <> 'quoted' then to_char(current_date - r.days_ago, 'MMDDYYYY') || '-1' end,
           current_date + r.eta, r.tracking, r.courier,
           case when r.status in ('shipped', 'delivered', 'closed') then current_date - r.days_ago + 12 end,
           case when r.status in ('delivered', 'closed') then current_date - r.days_ago + 18 end,
           case when a.delivery_setup = 'our_booking' then 650 else 0 end,
           jsonb_build_object('name', a.legal_name, 'country', a.country, 'contact', 'Reception', 'address', 'Demo street 1')
      from public.accounts a where a.id = v_acc
    returning id into v_order;

    foreach l in array r.lines loop
      insert into public.order_lines (order_id, sku_id, qty, unit_price_usd, battery_new, battery_unit_usd)
      values (v_order,
              case split_part(l, '|', 1) when '13' then v_sku13 when '14' then v_sku14 when '15' then v_sku15 else v_sku16 end,
              split_part(l, '|', 2)::int, split_part(l, '|', 3)::numeric,
              split_part(l, '|', 4) = '1', split_part(l, '|', 5)::numeric)
      returning id into v_line;
      -- admin-only base price (≈ 6 % under the unit price) so the margin shows for Gabriel
      insert into public.order_lines_finance (order_line_id, base_price_usd)
      values (v_line, round(split_part(l, '|', 3)::numeric / 1.06, 2));
    end loop;

    foreach l in array r.pays loop
      select case split_part(l, '|', 1) when 'deposit' then ov.deposit_payable - ov.deposit_confirmed
                  else ov.payable_total - ov.deposit_payable - ov.balance_confirmed end
             - case when split_part(l, '|', 2) like 'short:%' then split_part(split_part(l, '|', 2), ':', 2)::numeric else 0 end
        into v_amount
        from public.order_overview ov where ov.id = v_order;
      insert into public.payments (order_id, type, amount, method, received_at, reference, difference_reason, notes)
      values (v_order, split_part(l, '|', 1)::public.payment_type, v_amount,
              (select payment_method from public.accounts where id = v_acc), current_date - r.days_ago + 2,
              case when (select payment_method from public.accounts where id = v_acc) = 'usdt' then 'TXID demo ' || substr(md5(l || r.code), 1, 16)
                   else 'MT103 demo ' || substr(md5(l || r.code), 1, 8) end,
              case when split_part(l, '|', 3) = '0' then 'short_payment' end,
              case when split_part(l, '|', 3) = '0' then 'Demo of SOP P3: short deposit, waiting for the admin.' end);
      if split_part(l, '|', 3) = '1' then
        update public.payments set status = 'confirmed' where order_id = v_order and status = 'awaiting_confirmation';
      end if;
    end loop;

    for i in 1..r.imeis loop
      v_imei_seq := v_imei_seq + 1;
      v_imei := pg_temp.luhn(lpad(v_imei_seq::text, 14, '0'));
      insert into public.imei_master (imei, sku_id, order_id, account_id, shipped_at)
      values (v_imei, (select sku_id from public.order_lines where order_id = v_order order by sort_order, created_at limit 1),
              v_order, v_acc, case when r.status in ('shipped', 'delivered', 'closed') then current_date - r.days_ago + 12 end)
      on conflict (imei) do nothing;
    end loop;
  end loop;
end $$;

-- The demo payments above are history: their "to confirm" notices are already read,
-- except the short deposit, which is the example of an item waiting for the admin.
update public.notifications set read_at = now()
 where kind in ('payment_to_confirm', 'order_ready') and read_at is null
   and link not in (select '/orders/' || p.order_id from public.payments p where p.status = 'awaiting_confirmation');
