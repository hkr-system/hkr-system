-- Deposit paid automatically (pgTAP, Nov 6 2026): a deposit confirmed while the order was Quoted moves the order to
-- Deposit paid as soon as it is Invoiced; without a confirmed deposit it stays Invoiced.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
insert into public.accounts (code, name, market) values ('DEP-GT-861', 'DEP A', 'LATAM');
insert into public.orders (account_id, order_date) select id, current_date from public.accounts where code = 'DEP-GT-861';
insert into public.orders (account_id, order_date) select id, current_date from public.accounts where code = 'DEP-GT-861';
create temp view o as select o.* from public.orders o join public.accounts a on a.id = o.account_id where a.code = 'DEP-GT-861' order by o.number;
insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed) select id, 'iPhone 14', 128, 10, 300, true from o;
insert into public.payments (order_id, account_id, type, amount, method)
select id, account_id, 'deposit', 300, 'wire' from o where number = 'ORD-01';
update public.payments set status = 'confirmed' where order_id = (select id from o where number = 'ORD-01');
select is((select status::text from o where number = 'ORD-01'), 'quoted', 'deposit confirmed while Quoted: stays Quoted');
update public.orders set status = 'invoiced' where id in (select id from o);
select is((select status::text from o where number = 'ORD-01'), 'deposit_paid', 'invoiced with a confirmed deposit → Deposit paid');
select is((select status::text from o where number = 'ORD-02'), 'invoiced', 'invoiced without a deposit → stays Invoiced');
select * from finish();
rollback;
