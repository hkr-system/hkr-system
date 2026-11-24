-- Lead price list (pgTAP, Nov 24 2026): admin + bd get base × (1 + lead_list_extra_pct %) through an rpc; the specialist does
-- not; the bd still cannot read the base rows nor the confidential % setting.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values ('admin', gen_random_uuid()), ('bd', gen_random_uuid()), ('as', gen_random_uuid());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', name || '@lead.local', '', now(), now() from ids;
update public.profiles set role = 'admin' where user_id = (select id from ids where name = 'admin');
update public.profiles set role = 'bd' where user_id = (select id from ids where name = 'bd');
update public.profiles set role = 'account_specialist' where user_id = (select id from ids where name = 'as');
create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = p_name)::text, 'role', 'authenticated')::text, true);
end $$;
-- expected prices from the approved Samsung base of the seeds (read here as superuser)
create temp table exp as
select r.model, r.storage_gb, round(r.price_usd * 1.025, 2) as price, l.version
  from public.price_lists l join public.price_list_rows r on r.price_list_id = l.id
 where l.account_id is null and l.status = 'approved' and l.brand = 'samsung';
grant select on exp to authenticated;
update public.settings set value = '2.5' where key = 'lead_list_extra_pct';

select pg_temp.login('bd');
select ok((select count(*) from exp) > 0 and not exists (
  select 1 from exp e left join public.lead_price_list('samsung') x on x.model = e.model and x.storage_gb = e.storage_gb
   where x.price_usd is distinct from e.price), 'bd gets every base row × (1 + 2.5 %), rounded to the cent');
select is((select count(*)::int from public.price_list_rows r join public.price_lists l on l.id = r.price_list_id where l.account_id is null), 0, 'bd still cannot read the base rows');
select is((select count(*)::int from public.settings where key = 'lead_list_extra_pct'), 0, 'bd cannot read the lead %');
select pg_temp.login('as');
select throws_ok($$ select * from public.lead_price_list('samsung') $$, '42501', null, 'the specialist does not get the lead list');
select pg_temp.login('admin');
select is((select base_version from public.lead_price_list('samsung') limit 1), (select version from exp limit 1), 'admin gets it with the base version');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.security_check()), 0, 'security_check clean');
select * from finish();
rollback;
