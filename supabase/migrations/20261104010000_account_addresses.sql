-- Saved shipping options per client, "like the address list in Amazon" (Gabriel, Nov 4 2026):
--   * A client ships to different places from order to order: direct to Guatemala, to its forwarder in Miami or to another
--     forwarder in Miami; a UK client to its forwarder in NL, direct to the UK, or to a company in Slovakia that does the
--     clearance. In Europe the same 2–5 logistics companies repeat across clients; in LATAM each client has its own.
--   * Each client keeps a list of saved addresses (company, contact, phone, email, address, kind); each ORDER picks one (or
--     adds a new one, saved to the list). The order still keeps its own copy (ship_to) so later edits never change old orders.
--   * LATAM logistics companies only receive and dispatch: the client pays HKR in USD. They are NOT intermediaries.
--   * Route (intermediary), invoice format and delivery set-up are chosen on each ORDER, not when the account is created.
--     The account keeps them only as "what the last order used" (trigger below), so a new order starts from the client's
--     last choice and the RMA batches / RMA ask queue (grouped by the account's intermediary) keep working.

create type public.address_kind as enum ('client', 'forwarder', 'clearance', 'other');

create table public.account_addresses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  label text not null,                       -- what the person picks, e.g. "Miami forwarder (XYZ Cargo)"
  kind public.address_kind not null default 'client',
  company text,
  contact_name text,
  phone text,
  email text,
  address text,
  city text,
  country text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);
create index account_addresses_account_idx on public.account_addresses (account_id);
select public.setup_table('public.account_addresses');

create policy account_addresses_select on public.account_addresses for select to authenticated
  using ((select public.has_account_access(account_id)));
create policy account_addresses_insert on public.account_addresses for insert to authenticated
  with check ((select public.has_account_access(account_id)));
create policy account_addresses_update on public.account_addresses for update to authenticated
  using ((select public.has_account_access(account_id))) with check ((select public.has_account_access(account_id)));
create policy account_addresses_delete on public.account_addresses for delete to authenticated
  using ((select public.is_admin()));

alter table public.orders
  add column address_id uuid references public.account_addresses(id) on delete set null;
create index orders_address_idx on public.orders (address_id);

-- an order can only use an address of its own client
create function public.orders_address_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.address_id is not null
     and not exists (select 1 from public.account_addresses x where x.id = new.address_id and x.account_id = new.account_id) then
    raise exception 'That address belongs to another client.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger orders_address_check
  before insert or update of address_id, account_id on public.orders
  for each row execute function public.orders_address_check();

-- the account remembers what its LAST order used (route, invoice format, delivery set-up)
create function public.orders_remember_on_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur public.currency_code := (case when new.intermediary_id is null then 'USD' else 'EUR' end)::public.currency_code;
begin
  if exists (select 1 from public.orders o
              where o.account_id = new.account_id and o.id <> new.id
                and (o.order_date, o.created_at) > (new.order_date, new.created_at)) then
    return null; -- an older order changed: the account keeps the latest order's choices
  end if;
  update public.accounts a
     set intermediary_id = new.intermediary_id,
         currency = v_cur,                                   -- SOP §2.4 (EUR = intermediary invoice)
         invoice_format = coalesce(new.invoice_format, a.invoice_format),
         delivery_setup = new.delivery_setup
   where a.id = new.account_id
     and (a.intermediary_id is distinct from new.intermediary_id
          or a.currency is distinct from v_cur
          or a.invoice_format is distinct from coalesce(new.invoice_format, a.invoice_format)
          or a.delivery_setup is distinct from new.delivery_setup);
  return null;
end;
$$;
revoke execute on function public.orders_remember_on_account() from public, anon, authenticated;
create trigger orders_remember_on_account
  after insert or update of intermediary_id, invoice_format, delivery_setup on public.orders
  for each row execute function public.orders_remember_on_account();
