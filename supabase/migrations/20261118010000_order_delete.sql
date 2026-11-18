-- Delete an order (Gabriel, Nov 18 2026). Admin only, from the order page, never by accident:
--   * refused when the order has a CONFIRMED payment (fix or delete the payment first, so money never vanishes from reports)
--   * refused when its invoice is APPROVED or SENT (void it first, so its INV-NN number is never lost)
--   * a DRAFT invoice is deleted with the order; a VOIDED invoice is kept with its number (order_id becomes empty)
--   * unconfirmed payments, lines, charges, events and finance go with the order (cascade); credit notes applied to it are
--     released (back to Issued, usable again); IMEIs loaded but not shipped are removed so they can be loaded on another order
--   * the order's file rows are deleted here; the app removes the files themselves from storage (folder ORD-NN)
-- The audit log keeps a copy of every deleted row.

-- a voided invoice keeps its number after its order is deleted
alter table public.invoices alter column order_id drop not null;
alter table public.invoices drop constraint invoices_order_id_fkey;
alter table public.invoices add constraint invoices_order_id_fkey
  foreign key (order_id) references public.orders (id) on delete set null;

create or replace function public.invoices_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := auth.uid() is null or public.is_admin();
begin
  -- the order of a VOIDED invoice is being deleted (order_delete, Nov 18 2026): it keeps its number and its client
  if tg_op = 'UPDATE' and new.order_id is null and old.order_id is not null and old.status = 'void'
     and current_setting('hkr.order_delete', true) = 'on' then
    return new;
  end if;
  if new.order_id is not null then
    select o.account_id into new.account_id from public.orders o where o.id = new.order_id;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'A new invoice starts as Draft.' using errcode = '42501'; end if;
    if new.number = '' then new.number := public.invoice_next_number_for(new.account_id); end if;
    return new;
  end if;

  if new.number is distinct from old.number and not v_admin then
    raise exception 'Only an admin can change an invoice number.' using errcode = '42501';
  end if;
  if new.order_id is distinct from old.order_id then
    raise exception 'An invoice stays on its order.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' and old.status = 'draft' then
      if not v_admin then raise exception 'Only an admin can approve an invoice.' using errcode = '42501'; end if;
      new.approved_at := now(); new.approved_by := auth.uid();
    elsif new.status = 'sent' and old.status = 'approved' then
      new.sent_at := now(); new.sent_by := auth.uid();
    elsif new.status = 'draft' and old.status in ('approved', 'sent') then
      if not v_admin then raise exception 'Only an admin can reopen an invoice.' using errcode = '42501'; end if;
      new.version := old.version + 1;
      new.approved_at := null; new.approved_by := null; new.sent_at := null; new.sent_by := null;
    elsif new.status = 'void' then
      if not v_admin then raise exception 'Only an admin can void an invoice.' using errcode = '42501'; end if;
    else
      raise exception 'Invoice status cannot go from % to %.', old.status, new.status using errcode = '42501';
    end if;
  elsif old.status <> 'draft' then
    -- frozen content: only the stored files may be attached after approval
    if (new.invoice_date, new.billing_entity, new.payment_method, new.consignee, new.ship_to, new.notify, new.shipment, new.lines, new.total_usd)
       is distinct from (old.invoice_date, old.billing_entity, old.payment_method, old.consignee, old.ship_to, old.notify, old.shipment, old.lines, old.total_usd) then
      raise exception 'An approved invoice cannot be edited: an admin reopens it as a new version.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create function public.order_delete(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record; v_paths text[]; v_inv text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin deletes an order.' using errcode = '42501';
  end if;
  select id, number, account_id into o from public.orders where id = p_order for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.payments where order_id = p_order and status = 'confirmed') then
    raise exception 'This order has confirmed payments: delete or fix them in the Payments tab first.' using errcode = '23514';
  end if;
  select number into v_inv from public.invoices where order_id = p_order and status in ('approved', 'sent') limit 1;
  if v_inv is not null then
    raise exception 'Invoice % is approved: void it in the Invoice tab first (its number is kept).', v_inv using errcode = '23514';
  end if;
  if exists (select 1 from public.imei_master where order_id = p_order and shipped_at is not null) then
    raise exception 'Units of this order were shipped: it cannot be deleted.' using errcode = '23514';
  end if;

  select coalesce(array_agg(storage_path), '{}') into v_paths
    from public.files where owner_table = 'orders' and owner_id = p_order;
  delete from public.files where owner_table = 'orders' and owner_id = p_order;
  delete from public.imei_master where order_id = p_order and shipped_at is null;
  delete from public.invoices where order_id = p_order and status = 'draft';
  perform set_config('hkr.order_delete', 'on', true);
  delete from public.orders where id = p_order;   -- voided invoices stay (order_id → null)
  perform set_config('hkr.order_delete', 'off', true);
  return jsonb_build_object('number', o.number, 'account_id', o.account_id, 'paths', to_jsonb(v_paths));
end;
$$;
revoke execute on function public.order_delete(uuid) from public, anon;
grant execute on function public.order_delete(uuid) to authenticated;
