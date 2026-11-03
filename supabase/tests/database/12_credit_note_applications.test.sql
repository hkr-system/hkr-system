-- Credit notes applied to orders (pgTAP, Nov 3 2026): only approved USD notes of the same client, split across orders
-- without going over the amount; the order's discount follows; Applied when fully used; approved invoice = locked;
-- the discount can no longer be typed on the order.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid()), ('bd', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@cn.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;

-- set-up as the database owner: one client, two orders, two credit notes (one approved without RMA, one draft)
insert into public.accounts (code, name, market) values ('CNA-NL-801', 'Credit client', 'EU'), ('OTH-NL-802', 'Other client', 'EU');
insert into public.orders (account_id, order_date, status) select id, '2031-04-01', 'invoiced' from public.accounts where code = 'CNA-NL-801';
insert into public.orders (account_id, order_date, status) select id, '2031-04-02', 'invoiced' from public.accounts where code = 'CNA-NL-801';
insert into public.orders (account_id, order_date, status) select id, '2031-04-03', 'invoiced' from public.accounts where code = 'OTH-NL-802';
insert into public.order_lines (order_id, description, qty, unit_price_usd) select id, 'x', 10, 100 from public.orders where order_date between '2031-04-01' and '2031-04-03';
insert into public.credit_notes (account_id, status, reason) select id, 'approved', 'Compensation, no IMEIs' from public.accounts where code = 'CNA-NL-801';
insert into public.credit_note_lines (credit_note_id, account_id, description, unit_price) select c.id, c.account_id, 'Compensation', 300 from public.credit_notes c join public.accounts a on a.id = c.account_id where a.code = 'CNA-NL-801';
insert into public.credit_notes (account_id, status) select id, 'draft' from public.accounts where code = 'CNA-NL-801';
create temp table k as
  select (select id from public.orders where order_date = '2031-04-01') o1, (select id from public.orders where order_date = '2031-04-02') o2,
         (select id from public.orders where order_date = '2031-04-03') o3,
         (select id from public.credit_notes c where c.status = 'approved' and c.account_id = (select id from public.accounts where code = 'CNA-NL-801')) cn,
         (select id from public.credit_notes c where c.status = 'draft' and c.account_id = (select id from public.accounts where code = 'CNA-NL-801')) cn_draft,
         (select id from public.accounts where code = 'CNA-NL-801') acc;
grant select on k to authenticated;

select pg_temp.login('as');
select lives_ok($$insert into public.credit_note_applications (credit_note_id, order_id, account_id, amount_usd) select cn, o1, acc, 100 from k$$,
  'specialist applies US$100 of the credit note to order 1');
select is((select rma_discount_usd::text || ' / ' || total_usd::text from public.orders where id = (select o1 from k)), '100.00 / 900.00',
  'the order discount follows the credit note: total 1,000 − 100');
select throws_ok($$insert into public.credit_note_applications (credit_note_id, order_id, account_id, amount_usd) select cn, o2, acc, 250 from k$$,
  '23514', null, 'cannot apply more than what is left (200)');
select lives_ok($$insert into public.credit_note_applications (credit_note_id, order_id, account_id, amount_usd) select cn, o2, acc, 200 from k$$,
  'the rest goes on order 2 (split across invoices)');
select is((select status::text from public.credit_notes where id = (select cn from k)), 'applied', 'fully used → Applied');
select throws_ok($$insert into public.credit_note_applications (credit_note_id, order_id, account_id, amount_usd) select cn_draft, o1, acc, 1 from k$$,
  '23514', null, 'a draft credit note cannot be applied');
select throws_ok($$insert into public.credit_note_applications (credit_note_id, order_id, account_id, amount_usd) select cn, o3, acc, 1 from k$$,
  null, null, 'never on another client''s order');
select lives_ok($$delete from public.credit_note_applications where order_id = (select o2 from k)$$, 'removing it from order 2…');
select is((select status::text from public.credit_notes where id = (select cn from k)), 'issued', '… puts the credit note back to Issued');
update public.orders set rma_discount_usd = 999 where id = (select o1 from k);
select is((select rma_discount_usd::text from public.orders where id = (select o1 from k)), '100.00', 'typing a discount on the order is ignored');

select pg_temp.login('bd');
select is((select count(*)::int from public.credit_note_applications), 0, 'bd without the account sees nothing');

-- an approved invoice locks its credit notes
set local role postgres;
select set_config('request.jwt.claims', '', true);
insert into public.invoices (order_id, account_id, billing_entity, payment_method, status, lines, total_usd)
select o1, acc, 'ever_state', 'wire', 'draft', '[]', 900 from k;
update public.invoices set status = 'approved' where order_id = (select o1 from k);
select pg_temp.login('as');
select throws_ok($$delete from public.credit_note_applications where order_id = (select o1 from k)$$, '23514', null,
  'approved invoice: credit notes locked until an admin reopens it');

select * from finish();
rollback;
