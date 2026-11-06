-- SIM option per order line (Gabriel, Nov 6 2026): iPhone 14, 15 and 16 series can be sold "eSIM only" instead of
-- "Physical SIM + eSIM" (what the base list rows say). SAME price — it is only an option of the line, printed on the invoice.
--   sim_option null = as in the list (Physical SIM + eSIM), nothing extra printed; 'esim' = "eSIM only" printed on the line.

alter table public.order_lines
  add column sim_option text check (sim_option in ('esim'));

-- the options trigger also checks the SIM option: iPhone 14 / 15 / 16 series only (16e included)
create or replace function public.order_lines_sim_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sim_option is not null and coalesce(new.model, '') !~* '^\s*iphone\s*1[4-6]' then
    raise exception 'eSIM only is an option of the iPhone 14, 15 and 16 series (%).', coalesce(new.model, 'no model')
      using errcode = '23514';
  end if;
  return new;
end;
$$;
-- runs after order_lines_options (alphabetical), so the model is already filled from the SKU
create trigger order_lines_sim_check
  before insert or update on public.order_lines
  for each row execute function public.order_lines_sim_check();
