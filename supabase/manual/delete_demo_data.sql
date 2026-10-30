-- DELETE THE DEMO DATA before real data goes in (Gabriel's decision, Oct 30 2026: "Borrarlos").
-- Run ONCE on the hosted project: Supabase → SQL Editor → paste this whole file → Run.
-- It is NOT a migration (it never runs on its own). Everything happens in one transaction:
-- if any step fails, nothing is deleted.
--
-- Deletes:  the demo accounts (is_demo = true, codes 9xx) with all their orders, lines, payments,
--           IMEIs, files list, invoices, RMAs, credit notes, contacts and client-portal logins;
--           RMA batches left empty; the 30 demo leads (demoNN@example.com) with their history;
--           the 4 demo WhatsApp numbers (is_demo) with their chats; notifications pointing to them.
-- Keeps:    real accounts and leads, the real WhatsApp numbers and chats (incl. "Test NL (Gabriel)"),
--           intermediaries, SKUs, templates, settings, sales goals/history, users, the audit log.
-- Note:     uploaded files of demo accounts stay in Storage but are no longer listed anywhere.

begin;

create temp table demo_accounts on commit drop as select id from public.accounts where is_demo;
create temp table demo_orders   on commit drop as select id from public.orders where account_id in (select id from demo_accounts);
create temp table demo_rmas     on commit drop as select id from public.rmas where account_id in (select id from demo_accounts);
create temp table demo_leads    on commit drop as select id from public.leads where email ~ '^demo[0-9]{2}@example\.com$';
create temp table demo_numbers  on commit drop as select id from public.wa_numbers where is_demo;
create temp table demo_convs    on commit drop as
  select id from public.wa_conversations where wa_number_id in (select id from demo_numbers);
create temp table demo_ids      on commit drop as
  select id from demo_accounts union all select id from demo_orders union all select id from demo_rmas
  union all select id from demo_leads union all select id from demo_convs;

-- notifications that open a demo record
delete from public.notifications n where exists (select 1 from demo_ids d where n.link like '%' || d.id::text || '%');

-- WhatsApp demo numbers and their chats / broadcasts
delete from public.wa_broadcast_recipients where broadcast_id in (select id from public.wa_broadcasts where wa_number_id in (select id from demo_numbers));
delete from public.wa_broadcasts where wa_number_id in (select id from demo_numbers);
delete from public.wa_conversations where id in (select id from demo_convs);           -- messages cascade
delete from public.wa_numbers where id in (select id from demo_numbers);

-- accounts: documents first, then orders, then the accounts (lines, payments, events, IMEIs, files, contacts cascade)
delete from public.credit_notes where account_id in (select id from demo_accounts);     -- lines cascade
delete from public.invoices where account_id in (select id from demo_accounts);
delete from public.rmas where id in (select id from demo_rmas);                         -- units cascade
delete from public.rma_batches b where not exists (select 1 from public.rma_units u where u.batch_id = b.id);
delete from public.orders where id in (select id from demo_orders);
delete from public.accounts where id in (select id from demo_accounts);

-- leads (history and contacts cascade; chats and form submissions of real numbers are only unlinked)
delete from public.leads where id in (select id from demo_leads);

-- what is left (all four should be 0)
select (select count(*) from public.accounts where is_demo) as demo_accounts_left,
       (select count(*) from public.leads where email ~ '^demo[0-9]{2}@example\.com$') as demo_leads_left,
       (select count(*) from public.wa_numbers where is_demo) as demo_numbers_left,
       (select count(*) from public.orders o where not exists (select 1 from public.accounts a where a.id = o.account_id)) as orphan_orders;

commit;
