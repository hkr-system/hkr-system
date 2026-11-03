-- Order lines by model + GB with colours and options (Gabriel, Nov 2 2026).
--  * A line is a model + GB (from the client's price list), no longer a SKU of one colour.
--  * Colours: Mixed, or a split by the model's official colours that MUST add up to the line quantity.
--  * Options per line: CE Marks, IMEI matching colour, and ONE battery option:
--      new (New batteries — the only one billed, on the separate "New battery cell" line, US$/unit editable),
--      boosted100 (Boosted to 100%), bh85_boosted (85%+ BH + Boosted), bh80 (80%+ BH, iPhone 14 and newer only).
--  * Invoice descriptions print the options unless the account's invoice_format.plain_lines is true
--    ("Used iPhone 12 128GB" and nothing else — some clients want no extras).
alter table public.order_lines
  add column model               text,
  add column storage_gb          integer check (storage_gb > 0),
  add column colors_mixed        boolean not null default false,
  add column colors              jsonb not null default '[]',      -- [{"color": "Midnight", "qty": 25}, …]
  add column ce_marked           boolean not null default false,
  add column imei_matching_color boolean not null default false,
  add column battery_option      text default 'new'               -- null = not specified (lines before Nov 2 2026)
    check (battery_option in ('new', 'boosted100', 'bh85_boosted', 'bh80'));
alter table public.order_lines drop constraint order_lines_item;
alter table public.order_lines add constraint order_lines_item check (sku_id is not null or model is not null or description is not null);
-- existing lines: battery_new = New batteries; without it the option is unknown (null), never guessed
update public.order_lines set battery_option = null where not battery_new;

create function public.order_lines_options()
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
  if new.battery_option = 'bh80' and coalesce(substring(v_model from '(\d{2})')::int, 0) < 14 then
    raise exception '80%%+ BH is only for iPhone 14 and newer (%).', v_model using errcode = '23514';
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
create trigger order_lines_options
  before insert or update on public.order_lines
  for each row execute function public.order_lines_options();
revoke execute on function public.order_lines_options() from public, anon, authenticated;

create or replace function public.order_recalc(p_order uuid)
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
         coalesce(sum(case when v_separate and l.battery_new
                                and coalesce(s.battery_eligible, coalesce(l.model, '') !~* 'iphone 16', true)
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

create or replace view public.portal_order_lines as
select l.order_id,
       coalesce(s.model || ' ' || s.storage_gb || 'GB ' || s.color,
                l.model || coalesce(' ' || l.storage_gb || 'GB', '') || case when l.colors_mixed then ' · Mixed colours' else '' end,
                l.description) as item,
       coalesce(s.model, l.model) as model, coalesce(s.storage_gb, l.storage_gb) as storage_gb, s.color, l.qty, l.unit_price_usd,
       l.battery_new, l.sort_order
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  left join public.skus s on s.id = l.sku_id
 where l.account_id = public.portal_account_id() and o.status <> 'quoted';


