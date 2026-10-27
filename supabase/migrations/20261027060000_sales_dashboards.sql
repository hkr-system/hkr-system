-- =============================================================================
-- HKR System — Sales, Accounts and Finance dashboards (Gabriel, 27 Oct 2026)
--   * revenue = invoice total of orders from "Invoiced" onward, dated by order date
--   * margin: admin sees all; a BD user sees the net margin of HER OWN accounts only
--     (never the base cost, never company totals); the specialist sees no margin
--   * sales goals per month for the company (admin) and per owner (the owner sees hers)
--   * sales history (monthly totals Gabriel keeps) + manual projection with a suggestion
--   * accounts without an order for N days are "inactive" (setting, default 45)
-- =============================================================================

insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('account_inactive_days', 'operations', 'Inactive account after (days)', '45', false, 55,
   'An active account with no order for this many days is flagged "inactive" on the Accounts dashboard.')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Orders for the dashboards, with the margin only where the viewer may see it.
-- -----------------------------------------------------------------------------
create function public.sales_orders(p_from date, p_to date)
returns table (
  order_id uuid, account_id uuid, number text, order_date date, status public.order_status,
  total_usd numeric, pieces integer, rma_discount_usd numeric, margin_usd numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.account_id, o.number, o.order_date, o.status, o.total_usd, o.pieces, o.rma_discount_usd,
         case
           when public.is_admin() then o.total_usd - f.base_cost_usd
           when public.current_app_role() = 'bd' and public.has_account_access(o.account_id) then o.total_usd - f.base_cost_usd
           else null
         end
    from public.orders o
    left join public.orders_finance f on f.order_id = o.id
   where o.status >= 'invoiced'
     and o.order_date between p_from and p_to
     and public.has_account_access(o.account_id);
$$;
revoke execute on function public.sales_orders(date, date) from public, anon;
grant execute on function public.sales_orders(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Sales goals: company (owner_user_id null) and per owner, one per month.
-- -----------------------------------------------------------------------------
create table public.sales_goals (
  id             uuid primary key default gen_random_uuid(),
  month          date not null check (extract(day from month) = 1),
  owner_user_id  uuid references public.profiles (user_id) on delete cascade,
  amount_usd     numeric(14, 2) not null check (amount_usd >= 0),
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now()
);
create unique index sales_goals_company_key on public.sales_goals (month) where owner_user_id is null;
create unique index sales_goals_owner_key on public.sales_goals (month, owner_user_id) where owner_user_id is not null;
select public.setup_table('public.sales_goals');

-- Monthly sales history (totals Gabriel keeps from before the system) — company figures, admin only.
create table public.sales_history (
  month       date primary key check (extract(day from month) = 1),
  amount_usd  numeric(14, 2) not null check (amount_usd >= 0),
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
select public.setup_table('public.sales_history', 'month');

-- Sales projection per month: Gabriel's figure, with the suggestion shown when he set it.
create table public.sales_projections (
  month          date primary key check (extract(day from month) = 1),
  amount_usd     numeric(14, 2) not null check (amount_usd >= 0),
  suggested_usd  numeric(14, 2),
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now()
);
select public.setup_table('public.sales_projections', 'month');

revoke all on public.sales_goals, public.sales_history, public.sales_projections from anon;
grant select, insert, update, delete on public.sales_goals, public.sales_history, public.sales_projections to authenticated;

create policy sales_goals_read on public.sales_goals
  for select to authenticated
  using ((select public.is_admin()) or owner_user_id = (select auth.uid()));
create policy sales_goals_admin_insert on public.sales_goals
  for insert to authenticated with check ((select public.is_admin()));
create policy sales_goals_admin_update on public.sales_goals
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy sales_goals_admin_delete on public.sales_goals
  for delete to authenticated using ((select public.is_admin()));

create policy sales_history_admin on public.sales_history
  for select to authenticated using ((select public.can_see_finance()));
create policy sales_history_admin_insert on public.sales_history
  for insert to authenticated with check ((select public.can_see_finance()));
create policy sales_history_admin_update on public.sales_history
  for update to authenticated using ((select public.can_see_finance())) with check ((select public.can_see_finance()));
create policy sales_history_admin_delete on public.sales_history
  for delete to authenticated using ((select public.can_see_finance()));

create policy sales_projections_admin on public.sales_projections
  for select to authenticated using ((select public.can_see_finance()));
create policy sales_projections_admin_insert on public.sales_projections
  for insert to authenticated with check ((select public.can_see_finance()));
create policy sales_projections_admin_update on public.sales_projections
  for update to authenticated using ((select public.can_see_finance())) with check ((select public.can_see_finance()));
create policy sales_projections_admin_delete on public.sales_projections
  for delete to authenticated using ((select public.can_see_finance()));
