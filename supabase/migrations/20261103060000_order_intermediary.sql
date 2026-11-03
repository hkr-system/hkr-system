-- Intermediary per ORDER (Gabriel, Nov 3 2026): the company that buys from us and invoices the client in EUR can change from
-- one order to the next (Global Connect, Galimix, DWT… any company). The account keeps its usual intermediary as the default
-- for new orders; each order carries its own and it can be changed on the order. RMA batches keep using the account's.

alter table public.orders add column intermediary_id uuid references public.intermediaries (id) on delete set null;
create index orders_intermediary_idx on public.orders (intermediary_id);

-- existing orders: the account's intermediary (nothing changes for them)
update public.orders o set intermediary_id = a.intermediary_id
  from public.accounts a where a.id = o.account_id and o.intermediary_id is null and a.intermediary_id is not null;
