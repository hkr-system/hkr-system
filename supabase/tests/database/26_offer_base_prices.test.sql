-- WhatsApp offers (pgTAP, Nov 24 2026): admin and bd with WhatsApp get the base prices (no margin) with the previous base;
-- the specialist and a bd without the WhatsApp module do not.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('bd2', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@offer.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id in (select id from ids where name in ('bd', 'bd2'));
update public.profiles set sections = array['dashboard', 'accounts', 'orders', 'leads'] where user_id = (select id from ids where name = 'bd2');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
create temp table exp as
select r.model, r.storage_gb, r.price_usd from public.price_lists l join public.price_list_rows r on r.price_list_id = l.id
 where l.account_id is null and l.status = 'approved' and l.brand = 'iphone';
grant select on exp to authenticated;

select pg_temp.login('bd');
select ok((select count(*) from exp) > 0 and not exists (
  select 1 from exp e left join public.offer_base_prices('iphone') x on x.model = e.model and x.storage_gb = e.storage_gb
   where x.price_usd is distinct from e.price_usd), 'bd with WhatsApp gets the base prices, no margin');
select pg_temp.login('bd2');
select throws_ok($$ select * from public.offer_base_prices('iphone') $$, '42501', null, 'bd without the WhatsApp module does not');
select pg_temp.login('as');
select throws_ok($$ select * from public.offer_base_prices('iphone') $$, '42501', null, 'the specialist does not');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.security_check()), 0, 'security_check clean');
select * from finish();
rollback;
