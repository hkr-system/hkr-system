-- Weekly backup while HKR stays on the free plans (Gabriel, Oct 30 2026: no Supabase Pro yet,
-- so no automatic daily backups). Every Sunday a Vercel cron exports every table to JSON in the
-- PRIVATE Storage bucket "backups" (backups/YYYY-MM-DD/<table>.json). Only the server (secret key)
-- reads or writes it; to download: Supabase → Storage → backups.

insert into storage.buckets (id, name, public) values ('backups', 'backups', false)
on conflict (id) do nothing;
-- no storage policies on purpose: only the service role (cron job) can touch this bucket

create function public.backup_table_names()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.relname::text from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
   order by c.relname;
$$;
revoke execute on function public.backup_table_names() from public, anon, authenticated;
grant execute on function public.backup_table_names() to service_role;

insert into public.settings (key, category, label, value, confidential, sort_order, description) values
  ('last_backup', 'system', 'Last weekly backup', '{}', false, 900,
   'Written by the weekly backup job: {"at": "...", "path": "...", "tables": n, "rows": n}.')
on conflict (key) do nothing;
