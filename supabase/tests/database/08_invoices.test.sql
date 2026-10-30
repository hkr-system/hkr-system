-- Invoices (pgTAP, Oct 30 2026): numbering MMDDYYYY(-n), who prepares / approves / reopens,
-- approved invoices frozen, order gets the invoice number, bd read-only, other accounts invisible.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean with invoices');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('as', gen_random_uuid()), ('bd2', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@inv.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id in (select id from ids where name in ('bd', 'bd2'));
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.system() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into public.accounts (code, name, market) values ('INV-NL-701', 'Inv A', 'EU');
insert into public.account_assignments (account_id, user_id, role_on_account)
select id, (select id from ids where name = 'bd'), 'owner' from public.accounts where code = 'INV-NL-701';
insert into public.orders (account_id, order_date) select id, '2031-01-15' from public.accounts where code = 'INV-NL-701';
insert into public.orders (account_id, order_date) select id, '2031-01-15' from public.accounts where code = 'INV-NL-701';
create temp table o as select id, row_number() over (order by created_at, id) as n from public.orders
 where account_id = (select id from public.accounts where code = 'INV-NL-701');
grant select on o to authenticated;

-- specialist prepares
select pg_temp.login('as');
select lives_ok($$insert into public.invoices (order_id, invoice_date, total_usd) select id, '2031-01-15', 100 from o where n = 1$$, 'specialist creates a draft');
select is((select number from public.invoices where order_id = (select id from o where n = 1)), '01152031', 'number = MMDDYYYY');
select throws_ok($$insert into public.invoices (order_id, invoice_date) select id, '2031-01-15' from o where n = 1$$,
  '23505', null, 'one live invoice per order');
select lives_ok($$insert into public.invoices (order_id, invoice_date, total_usd) select id, '2031-01-15', 50 from o where n = 2$$, 'second invoice the same day');
select is((select number from public.invoices where order_id = (select id from o where n = 2)), '01152031-2', 'same date → -2');
select throws_ok($$update public.invoices set status = 'approved' where order_id = (select id from o where n = 1)$$,
  '42501', 'Only an admin can approve an invoice.', 'specialist cannot approve');

-- bd reads, cannot write
select pg_temp.login('bd');
select is((select count(*)::int from public.invoices where account_id = (select id from public.accounts where code = 'INV-NL-701')), 2, 'owner bd reads the invoices');
select is_empty($$update public.invoices set consignee = 'x' returning id$$, 'bd cannot edit invoices');
select pg_temp.login('bd2');
select is((select count(*)::int from public.invoices), 0, 'other bd sees no invoices of that account');

-- admin approves: order gets the number; content frozen; specialist marks sent; admin reopens
select pg_temp.login('admin');
select lives_ok($$update public.invoices set status = 'approved' where order_id = (select id from o where n = 1)$$, 'admin approves');
select is((select hk_invoice_no from public.orders where id = (select id from o where n = 1)), '01152031', 'order shows the approved number');
select throws_ok($$update public.invoices set total_usd = 1 where order_id = (select id from o where n = 1)$$,
  '42501', 'An approved invoice cannot be edited: an admin reopens it as a new version.', 'approved invoice frozen');
select pg_temp.login('as');
select lives_ok($$update public.invoices set status = 'sent' where order_id = (select id from o where n = 1)$$, 'specialist marks it sent');
select throws_ok($$update public.invoices set status = 'draft' where order_id = (select id from o where n = 1)$$,
  '42501', 'Only an admin can reopen an invoice.', 'specialist cannot reopen');
select pg_temp.login('admin');
update public.invoices set status = 'draft' where order_id = (select id from o where n = 1);
select is((select version from public.invoices where order_id = (select id from o where n = 1)), 2, 'admin reopens → version 2');

select pg_temp.system();
select * from finish();
rollback;
