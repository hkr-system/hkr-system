-- Client price rules (pgTAP, Nov 3 2026): fixed US$ over the base per model + GB; admin + specialist manage them, bd cannot;
-- a new list prices ruled models at base + rule and the others with the engine; "remember" turns a typed price into a rule.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select is((select count(*)::int from public.security_check()), 0, 'security_check() clean with price rules');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('as', gen_random_uuid()), ('bd', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@rule.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;

insert into public.accounts (code, name, market) values ('RUL-GT-821', 'RUL A', 'LATAM');
create temp table a as select id from public.accounts where code = 'RUL-GT-821';
grant select on a to authenticated;
insert into public.account_assignments (account_id, user_id, role_on_account)
select (select id from a), (select id from ids where name = 'bd'), 'owner';

select pg_temp.login('admin');
insert into public.price_lists (account_id, note) values (null, 'rule base 1');
insert into public.price_list_rows (price_list_id, model, storage_gb, price_usd)
select id, m, g, p from public.price_lists, (values ('iPhone 13', 128, 270.00), ('iPhone 14', 128, 300.00)) v(m, g, p) where note = 'rule base 1';
update public.price_lists set status = 'approved' where note = 'rule base 1';

select pg_temp.login('bd');
select throws_ok($$insert into public.account_price_rules (account_id, model, storage_gb, increment_usd) values ((select id from a), 'iPhone 13', 128, 12)$$,
  '42501', null, 'bd cannot create a price rule');

select pg_temp.login('as');
select lives_ok($$insert into public.account_price_rules (account_id, model, storage_gb, increment_usd) values ((select id from a), 'iPhone 13', 128, 12)$$,
  'specialist creates a rule: iPhone 13 128 = base + $12');
select public.price_list_create_draft((select id from a), 1.0, 1.0, '{}');
create temp view r as select r.* from public.price_list_rows r join public.price_lists l on l.id = r.price_list_id
  where l.account_id = (select id from a) and l.status = 'draft';
grant select on r to authenticated;
select is((select price_usd || '/' || rule_increment_usd || '/' || rule_price_usd from r where model = 'iPhone 13'), '282.00/12.00/282.00', 'base 1 + rule = 282.00');
select is((select price_usd::text from r where model = 'iPhone 14'), '306.00', 'model without a rule follows the engine');
select ok((select adjusted_at is null from r where model = 'iPhone 13'), 'a rule price is not "adjusted"');

-- the specialist types 310 on iPhone 14 and remembers it → rule +10
update public.price_list_rows set price_usd = 310.00 where id = (select id from r where model = 'iPhone 14');
select is((select public.price_rule_remember((select id from r where model = 'iPhone 14'))), 10.00::numeric, 'remember: 310 − 300 = rule +$10');
select is((select count(*)::int from public.price_rules_for((select id from a)) where in_base), 2, 'both rules listed, both in the base');

-- base 2: new prices; the next list follows the rules
select pg_temp.login('admin');
insert into public.price_lists (account_id, note) values (null, 'rule base 2');
insert into public.price_list_rows (price_list_id, model, storage_gb, price_usd)
select id, m, g, p from public.price_lists, (values ('iPhone 13', 128, 260.00), ('iPhone 14', 128, 290.00)) v(m, g, p) where note = 'rule base 2';
update public.price_lists set status = 'approved' where note = 'rule base 2';
select pg_temp.login('as');
select public.price_list_create_draft((select id from a), 1.0, 1.0, '{}');
select is((select string_agg(price_usd::text, '/' order by model) from r), '272.00/300.00', 'base 2 + rules = 272.00 and 300.00');

select pg_temp.login('bd');
select is((select count(*)::int from public.price_rules_for((select id from a))), 0, 'bd does not see the rules');

select * from finish();
rollback;
