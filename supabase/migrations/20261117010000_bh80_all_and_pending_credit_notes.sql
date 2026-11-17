-- Nov 17 2026 (Gabriel):
-- 1. "80%+ BH" (battery health 80 %+, not boosted) can be chosen on EVERY iPhone, not only iPhone 14 and newer
--    (his invoices sell iPhone 13 mini with "80%+ BH Not Boosted"). Samsung still has no battery options.
-- 2. Credit notes are created right on the order (new order, imported invoice, order page) — no trip to another menu.
--    The admin's credit note is approved and applied at once. A credit note made by anyone else stays a DRAFT linked to
--    that order ("pending for the SD", SOP P10: only the SD approves); when the admin approves it, it is applied to that
--    order by itself (pending_order_id / pending_amount_usd → credit_note_applications).

-- 1 ── order_lines_options without the "iPhone 14 and newer" rule (same function otherwise)
create or replace function public.order_lines_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum int; v_model text;
begin
  -- a SKU line fills model + GB from the SKU (old lines, imports)
  if new.sku_id is not null and new.model is null then
    select s.model, s.storage_gb into new.model, new.storage_gb from public.skus s where s.id = new.sku_id;
  end if;
  v_model := coalesce(new.model, '');
  -- battery_new (older code, imports) and battery_option stay in step; the option wins when both change
  if tg_op = 'INSERT' and new.battery_option = 'new' and not new.battery_new then
    new.battery_option := null;               -- written without an option and without new batteries
  elsif tg_op = 'UPDATE' and new.battery_option is not distinct from old.battery_option
        and new.battery_new is distinct from old.battery_new then
    new.battery_option := case when new.battery_new then 'new' end;
  end if;
  new.battery_new := coalesce(new.battery_option = 'new', false);
  if public.brand_of(new.model) = 'samsung' and (new.battery_option is not null or new.ce_marked) then
    raise exception 'Battery options and CE marks do not apply to Samsung (%).', v_model using errcode = '23514';
  end if;
  if jsonb_typeof(new.colors) <> 'array' then
    raise exception 'Colours must be a list.' using errcode = '23514';
  end if;
  if new.colors_mixed then
    new.colors := '[]';
  elsif jsonb_array_length(new.colors) > 0 then
    select coalesce(sum((c ->> 'qty')::int), 0) into v_sum from jsonb_array_elements(new.colors) c;
    if v_sum <> new.qty then
      raise exception 'The colours add up to % but the line has % units.', v_sum, new.qty using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- 2 ── credit note waiting for the SD, to be applied to one order once approved
alter table public.credit_notes
  add column if not exists pending_order_id uuid references public.orders (id) on delete set null,
  add column if not exists pending_amount_usd numeric(12, 2) check (pending_amount_usd is null or pending_amount_usd > 0);
create index if not exists credit_notes_pending_order_idx on public.credit_notes (pending_order_id) where pending_order_id is not null;
comment on column public.credit_notes.pending_order_id is 'Made on an order by a non-admin: applied to this order (pending_amount_usd) when the admin approves it';

create function public.credit_notes_apply_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    -- clear first (the application below updates this credit note again), then apply; both undone together on error
    update public.credit_notes set pending_order_id = null, pending_amount_usd = null where id = new.id;
    insert into public.credit_note_applications (credit_note_id, order_id, account_id, amount_usd)
    values (new.id, new.pending_order_id, new.account_id, least(coalesce(new.pending_amount_usd, new.amount), new.amount));
  exception when others then
    -- e.g. the order's invoice was approved meanwhile: it stays pending and the admin applies it on the order page
    raise notice 'credit note % not applied: %', new.number, sqlerrm;
  end;
  return null;
end;
$$;
create trigger credit_notes_apply_pending
  after update of status on public.credit_notes
  for each row when (new.pending_order_id is not null and new.status in ('approved', 'issued') and old.status = 'draft')
  execute function public.credit_notes_apply_pending();
revoke execute on function public.credit_notes_apply_pending() from public, anon, authenticated;
