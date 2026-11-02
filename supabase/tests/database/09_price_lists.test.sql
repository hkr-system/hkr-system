-- Price lists (pgTAP, Nov 2 2026): base list admin-only, client lists prepared by specialist/admin inside the
-- engine rails, approved only by admin and then frozen, bd sees approved lists + floors of own accounts only,
-- order lines take the list price (source list/manual) and the base price lands in the admin-only finance row.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean with price lists');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('as', gen_random_uuid()), ('bd2', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@pl.local', '', now(), now() from ids;
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

insert into public.accounts (code, name, market) values ('PLT-NL-801', 'PL A', 'EU'), ('PLT-DE-802', 'PL B', 'EU');
insert into public.account_assignments (account_id, user_id, role_on_account)
select id, (select id from ids where name = 'bd'), 'owner' from public.accounts where code = 'PLT-NL-801';
create temp table a as select code, id from public.accounts where code like 'PLT-%';
grant select on a to authenticated;

-- base list by the admin
select pg_temp.login('admin');
insert into public.price_lists (account_id, note) values (null, 'test base');
insert into public.price_list_rows (price_list_id, model, storage_gb, price_usd)
select id, 'iPhone 15', 128, 285.00 from public.price_lists where note = 'test base';
select lives_ok($$update public.price_lists set status = 'approved' where note = 'test base'$$, 'admin approves the base list');

select pg_temp.login('bd');
select is((select count(*)::int from public.price_list_rows where account_id is null), 0, 'bd cannot read base prices');
select pg_temp.login('as');
select is((select count(*)::int from public.price_list_rows where account_id is null), 0, 'specialist cannot read base prices');
select throws_ok($$select public.price_list_create_draft((select id from a where code = 'PLT-NL-801'), 3.0, 0, '{}')$$,
  '42501', null, 'specialist cannot go outside the engine rails');
select lives_ok($$select public.price_list_create_draft((select id from a where code = 'PLT-NL-801'), 0.9, 2.0, '{}')$$,
  'specialist prepares a draft from the base');
select is((select price_usd || '/' || floor_usd from public.price_list_rows r join public.price_lists l on l.id = r.price_list_id
            where l.account_id = (select id from a where code = 'PLT-NL-801') and r.model = 'iPhone 15'), '293.27/287.57',
  'SOP 5.4: 285.00 → list 293.27, floor 287.57');
select throws_ok($$update public.price_lists set status = 'approved' where account_id = (select id from a where code = 'PLT-NL-801')$$,
  '42501', null, 'specialist cannot approve');
select throws_ok($$update public.price_lists set extra_c = 0 where account_id = (select id from a where code = 'PLT-NL-801')$$,
  '42501', null, 'specialist cannot change the percentages');

select pg_temp.login('bd');
select is((select count(*)::int from public.price_lists where account_id = (select id from a where code = 'PLT-NL-801')), 0, 'bd does not see drafts');

select pg_temp.login('admin');
select lives_ok($$select public.price_list_set_percentages((select id from public.price_lists where account_id = (select id from a where code = 'PLT-NL-801') and status = 'draft'), 1.4, 1.0, 'test')$$,
  'admin overrides the percentages');
select is((select price_usd::text from public.price_list_rows where account_id = (select id from a where code = 'PLT-NL-801')), '291.84',
  'repriced: 285 × 1.024');
select lives_ok($$update public.price_lists set status = 'approved' where account_id = (select id from a where code = 'PLT-NL-801') and status = 'draft'$$,
  'admin approves');
select throws_ok($$update public.price_list_rows set price_usd = 1 where account_id = (select id from a where code = 'PLT-NL-801')$$,
  '42501', null, 'approved list is frozen');

select pg_temp.login('bd');
select is((select floor_usd::text from public.price_list_rows where account_id = (select id from a where code = 'PLT-NL-801')), '288.99',
  'bd sees the approved list and its floor');
select pg_temp.login('bd2');
select is((select count(*)::int from public.price_list_rows where account_id is not null and account_id in (select id from a)), 0,
  'other bd sees nothing');

-- order lines
select pg_temp.login('as');
insert into public.orders (account_id, order_date) select id, '2031-02-01' from a where code = 'PLT-NL-801';
insert into public.order_lines (order_id, description, qty, unit_price_usd, price_list_row_id)
select o.id, 'x', 10, 291.84, r.id from public.orders o, public.price_list_rows r
 where o.account_id = (select id from a where code = 'PLT-NL-801') and r.account_id = o.account_id;
select is((select price_source || '/' || list_price_usd from public.order_lines where account_id = (select id from a where code = 'PLT-NL-801')),
  'list/291.84', 'line priced from the list');
update public.order_lines set unit_price_usd = 290 where account_id = (select id from a where code = 'PLT-NL-801');
select is((select price_source from public.order_lines where account_id = (select id from a where code = 'PLT-NL-801')), 'manual',
  'a different price is manual');
select pg_temp.system();
select is((select f.base_price_usd::text from public.order_lines_finance f join public.order_lines l on l.id = f.order_line_id
            where l.account_id = (select id from a where code = 'PLT-NL-801')), '285.00', 'base price filled for the admin');

select * from finish();
rollback;
