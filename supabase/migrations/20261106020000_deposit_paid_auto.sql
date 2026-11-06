-- Deposit paid automatically (Gabriel, Nov 6 2026: "cuando agregamos un pago, debería pasarse automáticamente a deposit paid").
-- Until now the order moved to Deposit paid only when the deposit was CONFIRMED while the order was already Invoiced.
-- A deposit confirmed earlier (order still Quoted) left the order on Invoiced once it was invoiced (ALP-PL-004 ORD-01).
-- Now: an order that reaches Invoiced with a confirmed deposit goes on to Deposit paid by itself.

create function public.orders_deposit_paid_auto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'invoiced'
     and exists (select 1 from public.payments p
                  where p.order_id = new.id and p.type = 'deposit' and p.status = 'confirmed' and p.amount > 0) then
    update public.orders set status = 'deposit_paid' where id = new.id and status = 'invoiced';
  end if;
  return null;
end;
$$;
revoke execute on function public.orders_deposit_paid_auto() from public, anon, authenticated;
create trigger orders_deposit_paid_auto
  after update of status on public.orders
  for each row when (new.status = 'invoiced' and old.status is distinct from new.status)
  execute function public.orders_deposit_paid_auto();

-- orders already Invoiced with a confirmed deposit move on now (status only; nothing is deleted)
update public.orders o set status = 'deposit_paid'
 where o.status = 'invoiced'
   and exists (select 1 from public.payments p
                where p.order_id = o.id and p.type = 'deposit' and p.status = 'confirmed' and p.amount > 0);
