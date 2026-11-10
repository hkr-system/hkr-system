-- Who is INVOICED vs who RECEIVES the goods (Gabriel, Nov 9 2026, from the Telcos invoice):
--   * Ultimate consignee on our invoice = the company we invoice. When an order goes via an intermediary (Galimix, Global
--     Connect…) or a clearance company (Barry Trading…), THAT company is invoiced and pays us in USD — the end client's name
--     does not appear. Direct orders invoice the client itself.
--   * Ship to = the logistics company that receives the cargo (the client's saved addresses, unchanged).
--   * Notify party = a contact: name, email, phone.
--   * Clearance companies are shared by many clients (one list, like the intermediaries), but each client keeps the ones it
--     uses as SUGGESTIONS that are offered first on its orders ("Save for this client").
--   * Company identifiers are separate fields (RSIN, EORI, KVK/CoC, VAT; usually only the VAT is needed). Empty ones are not
--     printed and the invoice header shrinks.

alter table public.intermediaries
  add column if not exists kind text not null default 'intermediary',
  add column if not exists rsin text,
  add column if not exists eori text,
  add column if not exists kvk  text,
  add column if not exists vat  text;
alter table public.intermediaries
  add constraint intermediaries_kind_check check (kind in ('intermediary', 'clearance'));
comment on column public.intermediaries.kind is 'intermediary (invoices the client) | clearance (clearance company); both are invoiced by HKR and pay HKR in USD';
comment on column public.intermediaries.vat_eori is 'Old single field (Nov 9 2026); copied to vat — use rsin / eori / kvk / vat';

-- the one-field "VAT / EORI" typed today goes to VAT (nothing is deleted; fix it in Settings if it held an EORI)
update public.intermediaries set vat = vat_eori where vat is null and coalesce(vat_eori, '') <> '';

-- each client's suggested companies (shared list, saved per client)
create table public.account_intermediaries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  intermediary_id uuid not null references public.intermediaries(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  unique (account_id, intermediary_id)
);
create index account_intermediaries_im_idx on public.account_intermediaries (intermediary_id);
select public.setup_table('public.account_intermediaries');

create policy account_intermediaries_select on public.account_intermediaries for select to authenticated
  using ((select public.has_account_access(account_id)));
create policy account_intermediaries_insert on public.account_intermediaries for insert to authenticated
  with check ((select public.has_account_access(account_id)));
create policy account_intermediaries_delete on public.account_intermediaries for delete to authenticated
  using ((select public.has_account_access(account_id)));

-- start the suggestions from what each client already used (its orders and its last route)
insert into public.account_intermediaries (account_id, intermediary_id)
select distinct account_id, intermediary_id from (
  select account_id, intermediary_id from public.orders where intermediary_id is not null
  union
  select id, intermediary_id from public.accounts where intermediary_id is not null
) x
on conflict do nothing;
