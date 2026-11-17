-- Nov 17 2026 (pgTAP): 80%+ BH on any iPhone; a credit note made on an order while waiting for the SD is applied to that
-- order by itself when it is approved (and stays out of the total until then).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
insert into public.accounts (code, name, market) values ('PCN-SK-871', 'PCN A', 'EU');
insert into public.orders (account_id, order_date) select id, current_date from public.accounts where code = 'PCN-SK-871';
create temp view o as select o.* from public.orders o join public.accounts a on a.id = o.account_id where a.code = 'PCN-SK-871';
select lives_ok($$ insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed, battery_option)
  select id, 'iPhone 13 mini', 128, 100, 240.2, true, 'bh80' from o $$, '80%+ BH is accepted on an iPhone 13 mini');
select throws_ok($$ insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed, battery_option)
  select id, 'S24 Ultra', 256, 1, 500, true, 'bh80' from o $$, '23514', null, 'Samsung still has no battery options');
insert into public.credit_notes (account_id, currency, reason, pending_order_id, pending_amount_usd)
select account_id, 'USD', 'RMA discount', id, 1000 from o;
insert into public.credit_note_lines (credit_note_id, description, qty, unit_price)
select id, 'RMA discount', 1, 1000 from public.credit_notes where pending_order_id = (select id from o);
select is((select total_usd from o), 24020.00::numeric, 'a draft credit note is not in the order total');
update public.credit_notes set status = 'approved' where number = 'PCN-SK-871-CN-01';
select is((select total_usd from o), 23020.00::numeric, 'approved → applied to its order: total minus US$1,000');
select is((select status::text from public.credit_notes where number = 'PCN-SK-871-CN-01'), 'applied', 'fully used → Applied');
select is((select pending_order_id from public.credit_notes where number = 'PCN-SK-871-CN-01'), null, 'no longer pending');
select * from finish();
rollback;
