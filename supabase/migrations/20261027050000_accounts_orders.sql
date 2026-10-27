-- =============================================================================
-- HKR System — Phase 3: accounts, contacts, orders, payments, IMEI master, files
-- Brief §6 (terms, invoicing chain, order lifecycle), §7 (tables), §8 (access);
-- SOP §2 (client code, folders, file names) and P1–P4.
-- Decisions (Gabriel, 27 Oct 2026):
--   * account owner/specialist live ONLY in account_assignments (no owner column)
--   * "Ready to ship" is a status (goods ready in HK, balance may be due); "Clear to ship"
--     is computed: balance confirmed + IMEI loaded + client label or our booking
--   * invoices (PDF/xlsx) come later in Phase 3, once the fixture invoices arrive
-- Confidential finance (base cost, margin) lives in *_finance tables, admin only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.billing_entity as enum ('ever_state', 'streamline_fze');
create type public.account_status as enum ('onboarding', 'active', 'paused', 'closed');
create type public.payment_method as enum ('wire', 'usdt');
create type public.currency_code as enum ('USD', 'EUR');
create type public.order_status as enum
  ('quoted', 'invoiced', 'deposit_paid', 'in_preparation', 'ready_to_ship',
   'balance_paid', 'shipped', 'delivered', 'closed');
create type public.delivery_setup as enum ('client_label', 'our_booking');
create type public.payment_type as enum ('deposit', 'balance', 'other');
create type public.payment_status as enum ('awaiting_confirmation', 'confirmed');
create type public.file_kind as enum
  ('INV-HK', 'INV-EU', 'PP-DEP', 'PP-BAL', 'IMEI', 'LABEL', 'TRK-HK', 'TRK-EU', 'POD', 'CN', 'OTHER');

-- -----------------------------------------------------------------------------
-- 2. Accounts: commercial set-up (P1). Code AAA-CC-NNN (SOP §2.1), never reused.
-- -----------------------------------------------------------------------------
alter table public.accounts
  add column legal_name          text,
  add column vat_eori            text,
  add column billing_entity      public.billing_entity not null default 'ever_state',
  add column intermediary_id     uuid references public.intermediaries (id) on delete set null,
  add column currency            public.currency_code not null default 'USD',
  add column payment_method      public.payment_method not null default 'wire',
  add column delivery_setup      public.delivery_setup not null default 'client_label',
  add column invoice_format      jsonb not null
    default '{"battery_line_separate": true, "show_ce_text": false, "show_note": false}',
  add column status              public.account_status not null default 'onboarding',
  add column tier                text,
  add column language            text not null default 'en' check (language in ('en', 'es')),
  add column drive_folder_url    text,
  add column whatsapp_group_note text,
  add column notes               text,   -- Account Notes (SOP §2.5): route, delivery set-up, exceptions…
  add column is_demo             boolean not null default false;

alter table public.accounts
  add constraint accounts_code_format check (code ~ '^[A-Z]{3}-[A-Z]{2}-[0-9]{3}$');

create index accounts_intermediary_idx on public.accounts (intermediary_id);

-- The last sequence number handed out (real accounts only; demo accounts use 9xx).
insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('account_code_last_seq', 'operations', 'Last client code number', '0', false, 50,
   'Global sequence of client codes AAA-CC-NNN (SOP §2.1). Updated automatically; a number is never reused.'),
  ('deposit_pct', 'terms', 'Deposit %', '10', false, 60,
   '10 % deposit on invoice; the 90 % balance is due before shipment (brief §6).'),
  ('usdt_fee_pct', 'terms', 'USDT fee %', '0.85', false, 70,
   'USDT (TRC-20 only): 0.85 % fee added as an invoice line (brief §6).'),
  ('moq_usd', 'terms', 'MOQ (US$ per order)', '20000', false, 80,
   'Minimum order US$20,000; sample order from US$10,000 for buyers of 400+ units/month (brief §6).'),
  ('sample_order_min_usd', 'terms', 'Sample order minimum (US$)', '10000', false, 90,
   'First (sample) order minimum; below it the SOP says escalate to the Sales Director.')
on conflict (key) do nothing;

create function public.account_code_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq int := substring(new.code from '[0-9]{3}$')::int;
begin
  if not new.is_demo then
    update public.settings
       set value = to_jsonb(greatest(coalesce((value #>> '{}')::int, 0), v_seq))
     where key = 'account_code_last_seq';
  end if;
  return new;
end;
$$;
create trigger account_code_track
  after insert or update of code on public.accounts
  for each row execute function public.account_code_track();
revoke execute on function public.account_code_track() from public, anon, authenticated;

-- Non-admins cannot change a client code once given (SOP: never reused / renamed).
create function public.accounts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is distinct from old.code and not public.is_admin() then
    raise exception 'Only an admin can change a client code.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger accounts_guard
  before update on public.accounts
  for each row execute function public.accounts_guard();
revoke execute on function public.accounts_guard() from public, anon, authenticated;

-- Access (brief §8): admin all; specialist all accounts (create + edit); bd edits own accounts.
drop policy accounts_admin_insert on public.accounts;
drop policy accounts_admin_update on public.accounts;
create policy accounts_insert on public.accounts
  for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'account_specialist'));
create policy accounts_update on public.accounts
  for update to authenticated
  using (public.has_account_access(id)) with check (public.has_account_access(id));

-- -----------------------------------------------------------------------------
-- 3. Contacts (of an account or of a lead). One phone ↔ one WhatsApp chat.
-- -----------------------------------------------------------------------------
create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid references public.accounts (id) on delete cascade,
  lead_id          uuid references public.leads (id) on delete cascade,
  name             text not null,
  role             text,      -- e.g. "confirms orders", "confirms payments", "reception"
  phone_e164       text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email            text,
  language         text not null default 'en' check (language in ('en', 'es')),
  whatsapp_opt_in  boolean not null default false,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now(),
  constraint contacts_owner check (account_id is not null or lead_id is not null)
);
create index contacts_account_idx on public.contacts (account_id);
create index contacts_lead_idx on public.contacts (lead_id);
create index contacts_phone_idx on public.contacts (phone_e164);
select public.setup_table('public.contacts');

create function public.can_see_contact_owner(p_account uuid, p_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_account is not null and public.has_account_access(p_account))
      or (p_account is null and p_lead is not null and public.is_staff());
$$;
revoke execute on function public.can_see_contact_owner(uuid, uuid) from public, anon;
grant execute on function public.can_see_contact_owner(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Orders (lifecycle brief §6) + lines + finance + status log
-- -----------------------------------------------------------------------------
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.accounts (id) on delete restrict,
  number               text not null,                         -- ORD-NN, per account (SOP §2.2)
  status               public.order_status not null default 'quoted',
  order_date           date not null default current_date,
  hk_invoice_no        text,
  partner_invoice_no   text,                                  -- EU intermediary invoice (route B), uploaded
  partner_invoice_eur  numeric(12, 2) check (partner_invoice_eur >= 0),
  payment_method       public.payment_method not null default 'wire',
  delivery_setup       public.delivery_setup not null default 'client_label',
  pieces               integer not null default 0,
  subtotal_usd         numeric(12, 2) not null default 0,     -- Σ qty × unit price
  battery_line_usd     numeric(12, 2) not null default 0,     -- separate "New battery cell" line, if the account uses it
  freight_usd          numeric(12, 2) not null default 0 check (freight_usd >= 0),
  customs_usd          numeric(12, 2) not null default 0 check (customs_usd >= 0),
  rma_discount_usd     numeric(12, 2) not null default 0 check (rma_discount_usd >= 0),
  usdt_fee_usd         numeric(12, 2) not null default 0,     -- 0.85 % line when paid in USDT
  total_usd            numeric(12, 2) not null default 0,     -- = HK invoice amount
  deposit_due_usd      numeric(12, 2) not null default 0,     -- 10 %
  balance_due_usd      numeric(12, 2) not null default 0,     -- total − deposit
  eta_date             date,
  ship_date            date,
  courier              text,
  tracking             text,                                  -- AWB
  delivered_date       date,
  ship_to              jsonb not null default '{}',           -- per order (brief §6): name, address, city, country, contact, phone
  notes                text,
  created_at           timestamptz not null default now(),
  created_by           uuid,
  updated_at           timestamptz not null default now(),
  unique (account_id, number)
);
create index orders_account_idx on public.orders (account_id);
create index orders_status_idx on public.orders (status);
select public.setup_table('public.orders');

create table public.order_lines (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  account_id        uuid not null references public.accounts (id) on delete cascade, -- copied for RLS
  sku_id            uuid references public.skus (id) on delete restrict,
  description       text,                                   -- free text when no SKU fits yet
  qty               integer not null check (qty > 0),
  unit_price_usd    numeric(12, 2) not null check (unit_price_usd >= 0),
  battery_new       boolean not null default false,          -- "New Battery cell 0 Cycle"
  battery_unit_usd  numeric(8, 2) not null default 0 check (battery_unit_usd >= 0), -- US$8/10/11 when billed separately
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  constraint order_lines_item check (sku_id is not null or description is not null)
);
create index order_lines_order_idx on public.order_lines (order_id);
select public.setup_table('public.order_lines');

-- Confidential: admin only (brief §3 row 2, §7).
create table public.orders_finance (
  order_id       uuid primary key references public.orders (id) on delete cascade,
  base_cost_usd  numeric(12, 2),
  margin_pct     numeric(6, 3),
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now()
);
select public.setup_table('public.orders_finance', 'order_id');

create table public.order_lines_finance (
  order_line_id   uuid primary key references public.order_lines (id) on delete cascade,
  base_price_usd  numeric(12, 2) check (base_price_usd >= 0),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now()
);
select public.setup_table('public.order_lines_finance', 'order_line_id');

create table public.order_events (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  account_id   uuid not null references public.accounts (id) on delete cascade,
  kind         text not null check (kind in ('status', 'payment', 'file', 'shipping', 'note')),
  from_status  public.order_status,
  to_status    public.order_status,
  body         text,
  file_id      uuid,
  user_id      uuid,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at desc);
select public.setup_table('public.order_events');

-- -----------------------------------------------------------------------------
-- 5. Payments (P3): the specialist records, only admin confirms (SOP: "Paid" only
--    after the Sales Director confirms the credit). Amounts in the payment currency.
-- -----------------------------------------------------------------------------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  account_id         uuid not null references public.accounts (id) on delete cascade,
  type               public.payment_type not null,
  amount             numeric(12, 2) not null check (amount > 0),
  currency           public.currency_code not null default 'USD',
  method             public.payment_method not null default 'wire',
  received_at        date not null default current_date,      -- proof / value date
  reference          text,                                     -- MT103 / payment advice ref / USDT TXID
  expected_amount    numeric(12, 2),                           -- what was due when recorded
  difference         numeric(12, 2),                           -- amount − expected
  difference_reason  text check (difference_reason in
                       ('none', 'bank_charges', 'fx', 'short_payment', 'overpayment', 'missing_usdt_fee')),
  status             public.payment_status not null default 'awaiting_confirmation',
  confirmed_by       uuid,
  confirmed_at       timestamptz,
  proof_file_id      uuid,
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status);
select public.setup_table('public.payments');

-- -----------------------------------------------------------------------------
-- 6. IMEI master (SOP §2.5): every unit ever shipped; source of the RMA check
-- -----------------------------------------------------------------------------
create table public.imei_master (
  id          uuid primary key default gen_random_uuid(),
  imei        text not null unique check (imei ~ '^[0-9]{15}$'),
  sku_id      uuid references public.skus (id) on delete set null,
  order_id    uuid references public.orders (id) on delete set null,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  shipped_at  date,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
create index imei_master_order_idx on public.imei_master (order_id);
create index imei_master_account_idx on public.imei_master (account_id);
select public.setup_table('public.imei_master');

-- -----------------------------------------------------------------------------
-- 7. Files (Supabase Storage, private bucket "account-files"):
--    <account_id>/orders/ORD-NN/<CODE>_ORD-NN_<KIND>.<ext>   (SOP §2.3 names)
-- -----------------------------------------------------------------------------
create table public.files (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  owner_table   text not null default 'accounts' check (owner_table in ('accounts', 'orders', 'rmas', 'price_lists', 'credit_notes')),
  owner_id      uuid,
  kind          public.file_kind not null default 'OTHER',
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now()
);
create index files_account_idx on public.files (account_id);
create index files_owner_idx on public.files (owner_table, owner_id);
select public.setup_table('public.files');

alter table public.payments
  add constraint payments_proof_file_fk foreign key (proof_file_id) references public.files (id) on delete set null;
alter table public.order_events
  add constraint order_events_file_fk foreign key (file_id) references public.files (id) on delete set null;

insert into storage.buckets (id, name, public, file_size_limit)
values ('account-files', 'account-files', false, 26214400)   -- 25 MB per file
on conflict (id) do nothing;

-- Storage access: the first folder of the path is the account id.
create function public.storage_account_access(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  if v_first !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  return public.has_account_access(v_first::uuid);
end;
$$;
revoke execute on function public.storage_account_access(text) from public, anon;
grant execute on function public.storage_account_access(text) to authenticated;

create policy account_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'account-files' and public.storage_account_access(name));
create policy account_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'account-files' and public.storage_account_access(name));
create policy account_files_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'account-files' and (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 8. Order numbering, totals and status rules
-- -----------------------------------------------------------------------------
create function public.setting_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key), p_default);
$$;
revoke execute on function public.setting_num(text, numeric) from public, anon;
grant execute on function public.setting_num(text, numeric) to authenticated;

-- ORD-NN per account (two digits, grows to three after 99).
create function public.orders_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next int;
begin
  if new.number is null or new.number = '' then
    perform pg_advisory_xact_lock(hashtext('orders:' || new.account_id::text));
    select coalesce(max(substring(number from '^ORD-([0-9]+)$')::int), 0) + 1 into v_next
      from public.orders where account_id = new.account_id;
    new.number := 'ORD-' || lpad(v_next::text, 2, '0');
  end if;
  return new;
end;
$$;
create trigger orders_before_insert
  before insert on public.orders
  for each row execute function public.orders_before_insert();
revoke execute on function public.orders_before_insert() from public, anon, authenticated;

-- Totals: subtotal + battery line (separate format only) + freight + customs − RMA discount,
-- + 0.85 % USDT fee when paid in USDT; deposit 10 %, balance = total − deposit (brief §6).
create function public.order_recalc(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_sub numeric; v_batt numeric; v_pcs int; v_base numeric; v_fee numeric; v_total numeric; v_dep numeric;
  v_separate boolean;
begin
  select ord.*, coalesce((a.invoice_format ->> 'battery_line_separate')::boolean, true) as sep
    into o
    from public.orders ord join public.accounts a on a.id = ord.account_id
   where ord.id = p_order;
  if not found then return; end if;
  v_separate := o.sep;
  select coalesce(sum(l.qty * l.unit_price_usd), 0),
         coalesce(sum(case when v_separate and l.battery_new and coalesce(s.battery_eligible, true)
                           then l.qty * l.battery_unit_usd else 0 end), 0),
         coalesce(sum(l.qty), 0)
    into v_sub, v_batt, v_pcs
    from public.order_lines l left join public.skus s on s.id = l.sku_id
   where l.order_id = p_order;
  v_base := v_sub + v_batt + o.freight_usd + o.customs_usd - o.rma_discount_usd;
  v_fee := case when o.payment_method = 'usdt'
                then round(v_base * public.setting_num('usdt_fee_pct', 0.85) / 100, 2) else 0 end;
  v_total := v_base + v_fee;
  v_dep := round(v_total * public.setting_num('deposit_pct', 10) / 100, 2);
  update public.orders
     set subtotal_usd = v_sub, battery_line_usd = v_batt, pieces = v_pcs, usdt_fee_usd = v_fee,
         total_usd = v_total, deposit_due_usd = v_dep, balance_due_usd = v_total - v_dep
   where id = p_order
     and (subtotal_usd, battery_line_usd, pieces, usdt_fee_usd, total_usd, deposit_due_usd, balance_due_usd)
         is distinct from (v_sub, v_batt, v_pcs, v_fee, v_total, v_dep, v_total - v_dep);
end;
$$;
revoke execute on function public.order_recalc(uuid) from public, anon, authenticated;

create function public.order_lines_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.order_recalc(coalesce(new.order_id, old.order_id));
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    perform public.order_recalc(old.order_id);
  end if;
  return null;
end;
$$;
create trigger order_lines_after_change
  after insert or update or delete on public.order_lines
  for each row execute function public.order_lines_after_change();
revoke execute on function public.order_lines_after_change() from public, anon, authenticated;

create function public.order_lines_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select o.account_id into new.account_id from public.orders o where o.id = new.order_id;
  return new;
end;
$$;
create trigger order_lines_before_write
  before insert or update of order_id on public.order_lines
  for each row execute function public.order_lines_before_write();
revoke execute on function public.order_lines_before_write() from public, anon, authenticated;

create function public.orders_after_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.order_recalc(new.id);
  return null;
end;
$$;
create trigger orders_after_amounts
  after insert or update of freight_usd, customs_usd, rma_discount_usd, payment_method on public.orders
  for each row execute function public.orders_after_amounts();
revoke execute on function public.orders_after_amounts() from public, anon, authenticated;

-- Finance: base cost = Σ qty × base price; margin % on the invoice total. Admin only.
create function public.order_finance_recalc(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost numeric; v_total numeric;
begin
  select sum(l.qty * f.base_price_usd) into v_cost
    from public.order_lines l join public.order_lines_finance f on f.order_line_id = l.id
   where l.order_id = p_order;
  select total_usd into v_total from public.orders where id = p_order;
  insert into public.orders_finance (order_id, base_cost_usd, margin_pct)
  values (p_order, v_cost,
          case when v_cost is not null and v_total > 0 then round((v_total - v_cost) / v_total * 100, 3) end)
  on conflict (order_id) do update
    set base_cost_usd = excluded.base_cost_usd, margin_pct = excluded.margin_pct;
end;
$$;
revoke execute on function public.order_finance_recalc(uuid) from public, anon, authenticated;

create function public.order_lines_finance_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.order_finance_recalc(
    (select l.order_id from public.order_lines l where l.id = coalesce(new.order_line_id, old.order_line_id)));
  return null;
end;
$$;
create trigger order_lines_finance_after_change
  after insert or update or delete on public.order_lines_finance
  for each row execute function public.order_lines_finance_after_change();
revoke execute on function public.order_lines_finance_after_change() from public, anon, authenticated;

create function public.orders_after_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.orders_finance where order_id = new.id) then
    perform public.order_finance_recalc(new.id);
  end if;
  return null;
end;
$$;
create trigger orders_after_total
  after update of total_usd on public.orders
  for each row execute function public.orders_after_total();
revoke execute on function public.orders_after_total() from public, anon, authenticated;

-- Readiness: what has been received and confirmed, and whether the order is clear to ship.
create view public.order_overview
with (security_invoker = true)
as
select o.id, o.account_id, o.number, o.status,
       a.code as account_code, a.name as account_name, a.market,
       (o.partner_invoice_eur is not null) as pays_in_eur,
       coalesce(o.partner_invoice_eur, o.total_usd) as payable_total,
       round(coalesce(o.partner_invoice_eur, o.total_usd) * public.setting_num('deposit_pct', 10) / 100, 2) as deposit_payable,
       coalesce((select sum(p.amount) from public.payments p
                  where p.order_id = o.id and p.type = 'deposit' and p.status = 'confirmed'), 0) as deposit_confirmed,
       coalesce((select sum(p.amount) from public.payments p
                  where p.order_id = o.id and p.type = 'balance' and p.status = 'confirmed'), 0) as balance_confirmed,
       exists (select 1 from public.payments p where p.order_id = o.id and p.status = 'awaiting_confirmation') as payment_awaiting,
       (o.status >= 'balance_paid'
         or exists (select 1 from public.payments p where p.order_id = o.id and p.type = 'balance' and p.status = 'confirmed'))
         as balance_ok,
       (select count(*) from public.imei_master i where i.order_id = o.id)::int as imei_count,
       case o.delivery_setup
         when 'client_label' then exists (select 1 from public.files f
                                           where f.owner_table = 'orders' and f.owner_id = o.id and f.kind = 'LABEL')
         else coalesce(o.courier, '') <> '' end as label_ok
  from public.orders o join public.accounts a on a.id = o.account_id;

-- Status rules (brief §6 + SOP):
--   * one step forward at a time; going back only by admin (corrections);
--   * Deposit paid / Balance paid need a CONFIRMED payment (admin confirms, SOP P3);
--   * Shipped needs: balance confirmed, IMEI file loaded, label or booking, AWB.
create function public.orders_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_steps text[] := enum_range(null::public.order_status)::text[];
  v_from int; v_to int;
  ov record;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  v_from := array_position(v_steps, old.status::text);
  v_to := array_position(v_steps, new.status::text);
  -- auth.uid() is null for system jobs (SQL editor, cron): no restriction
  if (select auth.uid()) is not null and not v_admin then
    if v_to <> v_from + 1 then
      raise exception 'Orders move one step at a time (% → %). Ask an admin to correct a status.',
        old.status, new.status using errcode = '23514';
    end if;
  end if;
  if v_to > v_from then
    select * into ov from public.order_overview where id = new.id;
    if new.status = 'deposit_paid' and ov.deposit_confirmed <= 0 and not v_admin then
      raise exception 'Deposit paid needs a deposit confirmed by an admin.' using errcode = '23514';
    end if;
    if new.status = 'balance_paid' and ov.balance_confirmed <= 0 and not v_admin then
      raise exception 'Balance paid needs a balance confirmed by an admin.' using errcode = '23514';
    end if;
    if new.status = 'shipped' then
      if not ov.balance_ok then
        raise exception 'Not clear to ship: the balance is not confirmed.' using errcode = '23514';
      end if;
      if ov.imei_count = 0 then
        raise exception 'Not clear to ship: load the IMEI file first.' using errcode = '23514';
      end if;
      if not ov.label_ok then
        raise exception 'Not clear to ship: upload the client label or enter the courier booking.' using errcode = '23514';
      end if;
      if coalesce(new.tracking, '') = '' then
        raise exception 'Enter the AWB / tracking number before marking Shipped.' using errcode = '23514';
      end if;
      new.ship_date := coalesce(new.ship_date, current_date);
    end if;
    if new.status = 'delivered' then
      new.delivered_date := coalesce(new.delivered_date, current_date);
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_status_guard
  before update of status on public.orders
  for each row execute function public.orders_status_guard();
revoke execute on function public.orders_status_guard() from public, anon, authenticated;

create function public.orders_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, account_id, kind, to_status, body, user_id)
    values (new.id, new.account_id, 'status', new.status, 'Order created', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, account_id, kind, from_status, to_status, user_id)
    values (new.id, new.account_id, 'status', old.status, new.status, auth.uid());
    if new.status = 'shipped' then
      update public.imei_master set shipped_at = new.ship_date where order_id = new.id and shipped_at is null;
    end if;
  end if;
  return null;
end;
$$;
create trigger orders_log_status
  after insert or update of status on public.orders
  for each row execute function public.orders_log_status();
revoke execute on function public.orders_log_status() from public, anon, authenticated;

-- Payments: expected amount and difference when recorded; only admin confirms; confirming
-- moves the order to Deposit paid / Balance paid when it is at the step before.
create function public.payments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ov record;
begin
  select o.account_id into new.account_id from public.orders o where o.id = new.order_id;
  if tg_op = 'INSERT' then
    select * into ov from public.order_overview where id = new.order_id;
    new.currency := case when ov.pays_in_eur then 'EUR' else 'USD' end::public.currency_code;
    if new.type = 'deposit' then
      new.expected_amount := ov.deposit_payable - ov.deposit_confirmed;
    elsif new.type = 'balance' then
      new.expected_amount := ov.payable_total - ov.deposit_payable - ov.balance_confirmed;
    end if;
    if new.expected_amount is not null then
      new.difference := new.amount - new.expected_amount;
      if new.difference = 0 then new.difference_reason := 'none'; end if;
    end if;
    new.status := 'awaiting_confirmation';
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not public.is_admin() and (select auth.uid()) is not null then
      raise exception 'Only an admin confirms a payment (SOP P3).' using errcode = '42501';
    end if;
    if new.status = 'confirmed' then
      new.confirmed_by := auth.uid();
      new.confirmed_at := now();
    else
      new.confirmed_by := null;
      new.confirmed_at := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger payments_before_write
  before insert or update on public.payments
  for each row execute function public.payments_before_write();
revoke execute on function public.payments_before_write() from public, anon, authenticated;

create function public.payments_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  u record;
  v_title text;
begin
  select ord.id, ord.number, ord.status, a.code into o
    from public.orders ord join public.accounts a on a.id = ord.account_id where ord.id = new.order_id;
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, account_id, kind, body, file_id, user_id)
    values (new.order_id, new.account_id, 'payment',
            initcap(new.type::text) || ' proof recorded: ' || new.currency || ' ' || to_char(new.amount, 'FM999,999,990.00')
              || coalesce(' · difference ' || to_char(new.difference, 'FM999,999,990.00')
                          || coalesce(' (' || replace(new.difference_reason, '_', ' ') || ')', ''), '')
              || ' · awaiting confirmation',
            new.proof_file_id, auth.uid());
    -- "accounts needing attention": every admin is asked to confirm
    v_title := 'Payment to confirm: ' || o.code || ' ' || o.number;
    for u in select p.user_id from public.profiles p where p.active and p.role = 'admin' loop
      perform public.notify_upsert(u.user_id, 'payment_to_confirm', v_title,
        initcap(new.type::text) || ' ' || new.currency || ' ' || to_char(new.amount, 'FM999,999,990.00'),
        '/orders/' || new.order_id);
    end loop;
  elsif new.status is distinct from old.status and new.status = 'confirmed' then
    insert into public.order_events (order_id, account_id, kind, body, user_id)
    values (new.order_id, new.account_id, 'payment',
            initcap(new.type::text) || ' confirmed: ' || new.currency || ' ' || to_char(new.amount, 'FM999,999,990.00'),
            auth.uid());
    if new.type = 'deposit' and o.status = 'invoiced' then
      update public.orders set status = 'deposit_paid' where id = new.order_id;
    elsif new.type = 'balance' and o.status = 'ready_to_ship' then
      update public.orders set status = 'balance_paid' where id = new.order_id;
    end if;
    update public.notifications set read_at = now()
     where kind = 'payment_to_confirm' and link = '/orders/' || new.order_id and read_at is null
       and not exists (select 1 from public.payments p
                        where p.order_id = new.order_id and p.status = 'awaiting_confirmation');
  end if;
  return null;
end;
$$;
create trigger payments_after_write
  after insert or update on public.payments
  for each row execute function public.payments_after_write();
revoke execute on function public.payments_after_write() from public, anon, authenticated;

-- Ready to ship with the balance still due → the account owner and the specialists chase it.
create function public.orders_notify_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record; a record;
begin
  if new.status = 'ready_to_ship' and old.status is distinct from new.status then
    select code into a from public.accounts where id = new.account_id;
    for u in
      select distinct p.user_id from public.profiles p
       where p.active and (p.role = 'account_specialist'
          or exists (select 1 from public.account_assignments x
                      where x.account_id = new.account_id and x.user_id = p.user_id))
    loop
      perform public.notify_upsert(u.user_id, 'order_ready', 'Ready to ship, balance due: ' || a.code || ' ' || new.number,
        'Remind the client to pay the balance (US$ ' || to_char(new.balance_due_usd, 'FM999,999,990.00') || ').',
        '/orders/' || new.id);
    end loop;
  end if;
  return null;
end;
$$;
create trigger orders_notify_ready
  after update of status on public.orders
  for each row execute function public.orders_notify_ready();
revoke execute on function public.orders_notify_ready() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. Grants and RLS policies
-- -----------------------------------------------------------------------------
revoke all on public.contacts, public.orders, public.order_lines, public.orders_finance,
              public.order_lines_finance, public.order_events, public.payments, public.imei_master,
              public.files
  from anon;
revoke all on public.order_overview from anon;
grant select, insert, update, delete on public.contacts, public.orders, public.order_lines,
  public.orders_finance, public.order_lines_finance, public.payments, public.imei_master, public.files
  to authenticated;
grant select, insert on public.order_events to authenticated;
grant select on public.order_overview to authenticated;
-- totals are computed by triggers, never typed; the account and number never change
revoke update on public.orders from authenticated;
grant update (status, order_date, hk_invoice_no, partner_invoice_no, partner_invoice_eur, payment_method,
              delivery_setup, freight_usd, customs_usd, rma_discount_usd, eta_date, ship_date, courier,
              tracking, delivered_date, ship_to, notes)
  on public.orders to authenticated;
revoke update on public.payments from authenticated;
grant update (status, difference_reason, notes, reference, received_at, proof_file_id) on public.payments to authenticated;

-- contacts
create policy contacts_read on public.contacts
  for select to authenticated using (public.can_see_contact_owner(account_id, lead_id));
create policy contacts_insert on public.contacts
  for insert to authenticated with check (public.can_see_contact_owner(account_id, lead_id));
create policy contacts_update on public.contacts
  for update to authenticated
  using (public.can_see_contact_owner(account_id, lead_id)) with check (public.can_see_contact_owner(account_id, lead_id));
create policy contacts_delete on public.contacts
  for delete to authenticated using (public.can_see_contact_owner(account_id, lead_id));

-- orders and lines: whoever sees the account works its orders; delete = admin
create policy orders_read on public.orders
  for select to authenticated using (public.has_account_access(account_id));
create policy orders_insert on public.orders
  for insert to authenticated with check (public.has_account_access(account_id));
create policy orders_update on public.orders
  for update to authenticated
  using (public.has_account_access(account_id)) with check (public.has_account_access(account_id));
create policy orders_admin_delete on public.orders
  for delete to authenticated using ((select public.is_admin()));

create policy order_lines_read on public.order_lines
  for select to authenticated using (public.has_account_access(account_id));
create policy order_lines_insert on public.order_lines
  for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id and public.has_account_access(o.account_id)));
create policy order_lines_update on public.order_lines
  for update to authenticated
  using (public.has_account_access(account_id)) with check (public.has_account_access(account_id));
create policy order_lines_delete on public.order_lines
  for delete to authenticated using (public.has_account_access(account_id));

-- finance: admin only, every action
create policy orders_finance_admin on public.orders_finance
  for select to authenticated using ((select public.can_see_finance()));
create policy orders_finance_admin_insert on public.orders_finance
  for insert to authenticated with check ((select public.can_see_finance()));
create policy orders_finance_admin_update on public.orders_finance
  for update to authenticated
  using ((select public.can_see_finance())) with check ((select public.can_see_finance()));
create policy orders_finance_admin_delete on public.orders_finance
  for delete to authenticated using ((select public.can_see_finance()));

create policy order_lines_finance_admin on public.order_lines_finance
  for select to authenticated using ((select public.can_see_finance()));
create policy order_lines_finance_admin_insert on public.order_lines_finance
  for insert to authenticated with check ((select public.can_see_finance()));
create policy order_lines_finance_admin_update on public.order_lines_finance
  for update to authenticated
  using ((select public.can_see_finance())) with check ((select public.can_see_finance()));
create policy order_lines_finance_admin_delete on public.order_lines_finance
  for delete to authenticated using ((select public.can_see_finance()));

-- events: read with the account; users may add notes only (status/payment rows come from triggers)
create policy order_events_read on public.order_events
  for select to authenticated using (public.has_account_access(account_id));
create policy order_events_note on public.order_events
  for insert to authenticated
  with check (kind in ('note', 'file', 'shipping') and public.has_account_access(account_id)
              and user_id = (select auth.uid()));

-- payments: record with account access; edit/delete history = admin (brief §8)
create policy payments_read on public.payments
  for select to authenticated using (public.has_account_access(account_id));
create policy payments_insert on public.payments
  for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id and public.has_account_access(o.account_id)));
create policy payments_admin_update on public.payments
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy payments_admin_delete on public.payments
  for delete to authenticated using ((select public.is_admin()));

-- IMEI master
create policy imei_master_read on public.imei_master
  for select to authenticated using (public.has_account_access(account_id));
create policy imei_master_insert on public.imei_master
  for insert to authenticated with check (public.has_account_access(account_id));
create policy imei_master_admin_update on public.imei_master
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy imei_master_delete on public.imei_master
  for delete to authenticated
  using ((select public.is_admin())
         or (public.has_account_access(account_id) and shipped_at is null));

-- files
create policy files_read on public.files
  for select to authenticated using (public.has_account_access(account_id));
create policy files_insert on public.files
  for insert to authenticated with check (public.has_account_access(account_id));
create policy files_admin_update on public.files
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy files_admin_delete on public.files
  for delete to authenticated using ((select public.is_admin()));

-- Realtime for the order page (status changes, payments confirmed by the admin)
alter publication supabase_realtime add table public.orders, public.payments, public.order_events;

-- -----------------------------------------------------------------------------
-- 10. WhatsApp: a client contact writing in is linked to the ACCOUNT (not a new lead)
-- -----------------------------------------------------------------------------
create function public.wa_conversations_link_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_id is null then
    select c.account_id into new.account_id
      from public.contacts c
     where c.phone_e164 = new.contact_phone and c.account_id is not null
     order by c.created_at
     limit 1;
  end if;
  return new;
end;
$$;
create trigger wa_conversations_link_account
  before insert on public.wa_conversations
  for each row execute function public.wa_conversations_link_account();
revoke execute on function public.wa_conversations_link_account() from public, anon, authenticated;

-- Existing chats with a known client phone get linked now.
update public.wa_conversations w
   set account_id = c.account_id
  from public.contacts c
 where w.account_id is null and c.account_id is not null and c.phone_e164 = w.contact_phone;

-- wa_ingest: same as Phase 2, except that a phone belonging to an account contact no
-- longer creates a lead, and an opt-out also clears the contact's opt-in.
create or replace function public.wa_ingest(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb; v_change jsonb; v_value jsonb; v_msg jsonb; v_st jsonb; v_contact jsonb;
  v_number_id uuid; v_conv uuid; v_lead uuid; v_phone text; v_name text; v_body text; v_type text;
  v_is_client boolean;
  v_status public.wa_message_status; v_ts timestamptz;
  v_new_messages int := 0; v_statuses int := 0;
begin
  if payload ->> 'object' is distinct from 'whatsapp_business_account' then
    return jsonb_build_object('ignored', true);
  end if;

  for v_entry in select * from jsonb_array_elements(coalesce(payload -> 'entry', '[]')) loop
    for v_change in select * from jsonb_array_elements(coalesce(v_entry -> 'changes', '[]')) loop
      continue when v_change ->> 'field' is distinct from 'messages';
      v_value := v_change -> 'value';

      insert into public.wa_numbers (phone_number_id, display_phone, label)
      values (v_value #>> '{metadata,phone_number_id}',
              '+' || regexp_replace(coalesce(v_value #>> '{metadata,display_phone_number}', ''), '[^0-9]', '', 'g'),
              'New number')
      on conflict (phone_number_id) do nothing;
      select id into v_number_id from public.wa_numbers where phone_number_id = v_value #>> '{metadata,phone_number_id}';

      for v_msg in select * from jsonb_array_elements(coalesce(v_value -> 'messages', '[]')) loop
        continue when exists (select 1 from public.wa_messages where meta_message_id = v_msg ->> 'id');
        v_phone := '+' || regexp_replace(v_msg ->> 'from', '[^0-9]', '', 'g');
        v_name := null;
        for v_contact in select * from jsonb_array_elements(coalesce(v_value -> 'contacts', '[]')) loop
          if regexp_replace(v_contact ->> 'wa_id', '[^0-9]', '', 'g') = regexp_replace(v_msg ->> 'from', '[^0-9]', '', 'g') then
            v_name := v_contact #>> '{profile,name}';
          end if;
        end loop;
        v_ts := to_timestamp((v_msg ->> 'timestamp')::bigint);
        v_type := v_msg ->> 'type';
        v_body := coalesce(
          v_msg #>> '{text,body}',
          v_msg #>> '{button,text}',
          v_msg #>> '{interactive,button_reply,title}',
          v_msg #>> '{interactive,list_reply,title}',
          v_msg #>> '{image,caption}', v_msg #>> '{document,caption}', v_msg #>> '{video,caption}',
          v_msg #>> '{document,filename}',
          case when v_type = 'location' then 'Location: ' || (v_msg #>> '{location,latitude}') || ', ' || (v_msg #>> '{location,longitude}') end,
          case when v_type = 'reaction' then 'Reaction ' || coalesce(v_msg #>> '{reaction,emoji}', '') end);

        -- client contact? (Phase 3) → linked to the account by the conversation trigger, no lead
        v_is_client := exists (select 1 from public.contacts c where c.phone_e164 = v_phone and c.account_id is not null);
        select id into v_lead from public.leads where phone_e164 = v_phone;
        if v_lead is null and not v_is_client then
          insert into public.leads (company, contact_name, phone_e164, source, stage)
          values (coalesce(nullif(v_name, ''), v_phone), v_name, v_phone, 'whatsapp_inbound', 'New')
          returning id into v_lead;
        end if;

        insert into public.wa_conversations (wa_number_id, contact_phone, contact_name, lead_id)
        values (v_number_id, v_phone, v_name, v_lead)
        on conflict (wa_number_id, contact_phone)
          do update set contact_name = coalesce(excluded.contact_name, public.wa_conversations.contact_name),
                        lead_id = coalesce(public.wa_conversations.lead_id, excluded.lead_id)
        returning id into v_conv;

        insert into public.wa_messages (conversation_id, direction, type, body, media_id, media_mime, media_filename,
                                        meta_message_id, status, cost_category, meta_timestamp)
        values (v_conv, 'inbound', v_type, v_body,
                coalesce(v_msg #>> '{image,id}', v_msg #>> '{document,id}', v_msg #>> '{audio,id}', v_msg #>> '{video,id}', v_msg #>> '{sticker,id}'),
                coalesce(v_msg #>> '{image,mime_type}', v_msg #>> '{document,mime_type}', v_msg #>> '{audio,mime_type}', v_msg #>> '{video,mime_type}', v_msg #>> '{sticker,mime_type}'),
                v_msg #>> '{document,filename}',
                v_msg ->> 'id', 'received', 'none', v_ts)
        on conflict (meta_message_id) do nothing;
        v_new_messages := v_new_messages + 1;

        if v_type in ('button', 'text', 'interactive')
           and coalesce(v_body, '') ~* '^\s*(stop|stop promotions|unsubscribe|baja|darme de baja|detener promociones|no más promociones)\s*$' then
          update public.contacts set whatsapp_opt_in = false where phone_e164 = v_phone;
          if v_lead is not null then
            update public.leads set whatsapp_opt_in = false where id = v_lead;
            insert into public.lead_events (lead_id, kind, body, user_id)
            values (v_lead, 'whatsapp', 'Opted out of WhatsApp promotions (' || v_body || ')', null);
          end if;
        end if;
      end loop;

      for v_st in select * from jsonb_array_elements(coalesce(v_value -> 'statuses', '[]')) loop
        v_status := case v_st ->> 'status'
                      when 'sent' then 'sent' when 'delivered' then 'delivered' when 'read' then 'read'
                      when 'failed' then 'failed' else null end;
        continue when v_status is null;
        v_ts := to_timestamp((v_st ->> 'timestamp')::bigint);
        update public.wa_messages m
           set status = case when public.wa_status_rank(v_status) > public.wa_status_rank(m.status) then v_status else m.status end,
               sent_at = coalesce(m.sent_at, case when v_status in ('sent', 'delivered', 'read') then v_ts end),
               delivered_at = coalesce(m.delivered_at, case when v_status in ('delivered', 'read') then v_ts end),
               read_at = coalesce(m.read_at, case when v_status = 'read' then v_ts end),
               error_code = coalesce(v_st #>> '{errors,0,code}', m.error_code),
               error_title = coalesce(v_st #>> '{errors,0,title}', v_st #>> '{errors,0,message}', m.error_title)
         where m.meta_message_id = v_st ->> 'id';
        if found then v_statuses := v_statuses + 1; end if;

        update public.wa_broadcast_recipients r
           set status = case
                 when v_status = 'failed' then 'failed'
                 when v_status = 'read' then 'read'
                 when v_status = 'delivered' and r.status in ('queued', 'sent') then 'delivered'
                 else r.status end,
               error_title = coalesce(v_st #>> '{errors,0,title}', r.error_title)
          from public.wa_messages m
         where m.meta_message_id = v_st ->> 'id' and r.message_id = m.id;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('messages', v_new_messages, 'statuses', v_statuses);
end;
$$;
revoke execute on function public.wa_ingest(jsonb) from public, anon, authenticated;
grant execute on function public.wa_ingest(jsonb) to service_role;
