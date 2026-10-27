-- Dashboards tests (pgTAP): margin visibility, goals, history/projections are admin only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean after dashboards');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@p3d.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;

insert into public.accounts (code, name, market) values ('DSA-NL-701', 'Dash A', 'EU'), ('DSB-MX-702', 'Dash B', 'LATAM');
insert into public.account_assignments (account_id, user_id, role_on_account)
select id, (select id from ids where name = 'bd'), 'owner' from public.accounts where code = 'DSA-NL-701';
insert into public.orders (account_id, status, order_date) select id, 'invoiced', current_date from public.accounts where code like 'DS_-%';
insert into public.order_lines (order_id, qty, unit_price_usd, description) select id, 10, 100, 'x' from public.orders o
 where account_id in (select id from public.accounts where code like 'DS_-%');
insert into public.order_lines_finance (order_line_id, base_price_usd)
select l.id, 90 from public.order_lines l where l.account_id in (select id from public.accounts where code like 'DS_-%');
insert into public.sales_goals (month, owner_user_id, amount_usd) values
  (date_trunc('month', current_date)::date, null, 100000),
  (date_trunc('month', current_date)::date, (select id from ids where name = 'bd'), 40000);

select pg_temp.login('bd');
select is((select count(*)::int from public.sales_orders(current_date - 1, current_date + 1) s
            join public.accounts a on a.id = s.account_id where a.code like 'DS_-%'), 1, 'bd: only her account in sales');
select is((select margin_usd from public.sales_orders(current_date - 1, current_date + 1) s
            join public.accounts a on a.id = s.account_id where a.code = 'DSA-NL-701'), 100.00::numeric, 'bd: net margin of her own account');
select is((select count(*)::int from public.orders_finance), 0, 'bd: still no base cost table access');
select is((select count(*)::int from public.sales_goals), 1, 'bd: sees only her own goal');
select is((select count(*)::int from public.sales_history), 0, 'bd: no company history');

select pg_temp.login('as');
select is((select count(*)::int from public.sales_orders(current_date - 1, current_date + 1) s
            join public.accounts a on a.id = s.account_id where a.code like 'DS_-%' and s.margin_usd is not null), 0,
          'specialist: no margin');
select is((select count(*)::int from public.sales_goals), 0, 'specialist: no goals');

select pg_temp.login('admin');
select is((select count(*)::int from public.sales_orders(current_date - 1, current_date + 1) s
            join public.accounts a on a.id = s.account_id where a.code like 'DS_-%' and s.margin_usd = 100), 2, 'admin: margin of all accounts');
select lives_ok($$insert into public.sales_history (month, amount_usd) values ('2024-01-01', 1000)$$, 'admin writes history');

select * from finish();
rollback;
