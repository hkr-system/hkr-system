-- Door-to-door price lists in EUR for EU clients (Gabriel, Nov 18 2026). Each intermediary / clearance company can have a
-- door-to-door pricing set-up (intermediaries.d2d): per-unit EUR fee by price bracket, a fixed EUR fee per unit, shipping per
-- unit (EUR or USD), a small-order surcharge, a per-shipment fee and the spread it takes on the EUR/USD rate. When a client
-- list is produced "door to door via <company>", every price = (client USD price [+ USD shipping]) ÷ rate → EUR + fees.
-- The company's name never appears on the client's file. Only an admin edits the set-up (its fees are commercial data).
-- The real fees are typed by Gabriel in Settings → Intermediaries & clearance (this public repo holds no real figures).

alter table public.intermediaries add column if not exists d2d jsonb;
comment on column public.intermediaries.d2d is 'Door-to-door pricing set-up: {enabled, brackets:[{up_to,eur}], fixed_eur, ship_amount, ship_currency, small_under, small_eur, shipment_eur, fx_spread}. Admin only.';

create function public.intermediaries_d2d_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.d2d is not null or tg_op = 'UPDATE' and new.d2d is distinct from old.d2d)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin sets up door-to-door pricing.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger intermediaries_d2d_guard before insert or update of d2d on public.intermediaries
  for each row execute function public.intermediaries_d2d_guard();
revoke execute on function public.intermediaries_d2d_guard() from public, anon, authenticated;

-- which prices were sent: plain USD (FOB Hong Kong) or door to door in EUR via a company at a rate
alter table public.price_list_sends
  add column if not exists variant text not null default 'usd' check (variant in ('usd', 'd2d')),
  add column if not exists via_intermediary_id uuid references public.intermediaries (id) on delete set null,
  add column if not exists fx_rate numeric(8, 4) check (fx_rate is null or fx_rate > 0);
