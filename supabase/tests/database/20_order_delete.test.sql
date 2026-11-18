-- Delete an order (pgTAP, Nov 18 2026): admin only; refused with a confirmed payment or an approved invoice; a draft invoice
-- goes with it, a voided one keeps its number; applied credit notes are released; IMEIs not shipped are removed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@del.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.su() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;

insert into public.accounts (code, name, market) values ('DEL-NL-861', 'DEL A', 'EU');
create temp table o (n text primary key, id uuid);
grant select on o to authenticated;
with x as (insert into public.orders (account_id, order_date) select id, current_date from public.accounts where code = 'DEL-NL-861' returning id, number)
insert into o select number, id from x;
with x as (insert into public.orders (account_id, order_date) select id, current_date from public.accounts where code = 'DEL-NL-861' returning id, number)
insert into o select number, id from x;
with x as (insert into public.orders (account_id, order_date) select id, current_date from public.accounts where code = 'DEL-NL-861' returning id, number)
insert into o select number, id from x;
insert into public.order_lines (order_id, model, storage_gb, qty, unit_price_usd, colors_mixed) select id, 'iPhone 13', 128, 10, 200, true from o;
-- ORD-01: draft invoice, applied credit note, IMEI not shipped, one awaiting payment → deletable
insert into public.invoices (order_id, account_id) select o.id, a.id from o, public.accounts a where o.n = 'ORD-01' and a.code = 'DEL-NL-861';
insert into public.credit_notes (account_id, currency, reason) select id, 'USD', 'test' from public.accounts where code = 'DEL-NL-861';
insert into public.credit_note_lines (credit_note_id, description, qty, unit_price) select id, 'x', 1, 100 from public.credit_notes where number = 'DEL-NL-861-CN-01';
update public.credit_notes set status = 'approved' where number = 'DEL-NL-861-CN-01';
insert into public.credit_note_applications (credit_note_id, order_id, account_id, amount_usd)
select c.id, o.id, c.account_id, 100 from public.credit_notes c, o where c.number = 'DEL-NL-861-CN-01' and o.n = 'ORD-01';
insert into public.imei_master (imei, order_id, account_id) select '490154203237518', o.id, a.id from o, public.accounts a where o.n = 'ORD-01' and a.code = 'DEL-NL-861';
insert into public.payments (order_id, account_id, type, amount, method) select o.id, a.id, 'deposit', 180, 'wire' from o, public.accounts a where o.n = 'ORD-01' and a.code = 'DEL-NL-861';
-- ORD-02: confirmed payment → refused
insert into public.payments (order_id, account_id, type, amount, method) select o.id, a.id, 'deposit', 200, 'wire' from o, public.accounts a where o.n = 'ORD-02' and a.code = 'DEL-NL-861';
update public.payments set status = 'confirmed' where order_id = (select id from o where n = 'ORD-02');
-- ORD-03: approved invoice → refused; voided → deletable, the invoice stays
insert into public.invoices (order_id, account_id) select o.id, a.id from o, public.accounts a where o.n = 'ORD-03' and a.code = 'DEL-NL-861';
update public.invoices set status = 'approved' where order_id = (select id from o where n = 'ORD-03');

select pg_temp.login('as');
select throws_ok($$ select public.order_delete((select id from o where n = 'ORD-01')) $$, '42501', null, 'a specialist cannot delete an order');
select pg_temp.login('admin');
select throws_ok($$ select public.order_delete((select id from o where n = 'ORD-02')) $$, '23514', null, 'refused: confirmed payment');
select throws_ok($$ select public.order_delete((select id from o where n = 'ORD-03')) $$, '23514', null, 'refused: approved invoice');
select lives_ok($$ select public.order_delete((select id from o where n = 'ORD-01')) $$, 'admin deletes an order with a draft invoice');
select pg_temp.su();
select is((select count(*)::int from public.orders where id = (select id from o where n = 'ORD-01')), 0, 'the order is gone');
select is((select count(*)::int from public.invoices where order_id is null and account_id = (select id from public.accounts where code = 'DEL-NL-861')), 0, 'its draft invoice is gone');
select is((select status::text from public.credit_notes where number = 'DEL-NL-861-CN-01'), 'issued', 'the credit note is released (back to Issued, usable again)');
select is((select count(*)::int from public.imei_master where imei = '490154203237518'), 0, 'the IMEI not shipped is removed');
update public.invoices set status = 'void' where order_id = (select id from o where n = 'ORD-03');
select pg_temp.login('admin');
select lives_ok($$ select public.order_delete((select id from o where n = 'ORD-03')) $$, 'a voided invoice no longer blocks');
select pg_temp.su();
select is((select count(*)::int from public.invoices where order_id is null and status = 'void' and account_id = (select id from public.accounts where code = 'DEL-NL-861')), 1,
  'the voided invoice keeps its number');
select is((select count(*)::int from public.security_check()), 0, 'security_check() clean');
select * from finish();
rollback;
