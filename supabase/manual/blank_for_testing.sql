-- BLANK SYSTEM FOR REAL TESTING (Gabriel, Nov 4 2026): "necesito el sistema completamente en blanco".
-- Run ONCE on the hosted project: Supabase → SQL Editor → paste this whole file → Run.
-- It is NOT a migration. Everything happens in one transaction: if any step fails, nothing is deleted.
--
-- Deletes:  the demo accounts (is_demo, codes 9xx) with everything that hangs from them: orders, lines, payments, IMEIs,
--           files list, invoices, RMAs, RMA batches left empty, credit notes and their applications, client price lists,
--           price rules, client updates, escalations, contacts, assignments and client-portal logins;
--           the 30 demo leads (demoNN@example.com) and the lead "TEST Claude check (delete me)" with their history;
--           notifications that open one of those records.
-- Keeps:    EVERYTHING of WhatsApp (numbers, chats, messages, broadcasts, templates — Gabriel: "no toques NADA"), so the
--           leads linked to WhatsApp ("Test NL (Gabriel)", "Gabriel Andaluz", "test user name") stay too;
--           the BASE price list (real prices), SKUs, intermediaries, settings (invoice issuer, engine…), users,
--           sales goals / history, the audit log (append-only by design).
-- Note:     uploaded files of demo accounts stay in Storage but are no longer listed anywhere.

begin;

create temp table demo_accounts on commit drop as select id from public.accounts where is_demo;
create temp table demo_orders   on commit drop as select id from public.orders where account_id in (select id from demo_accounts);
create temp table demo_rmas     on commit drop as select id from public.rmas where account_id in (select id from demo_accounts);
create temp table demo_leads    on commit drop as
  select id from public.leads
   where (email ~ '^demo[0-9]{2}@example\.com$' or company = 'TEST Claude check (delete me)')
     and not exists (select 1 from public.wa_conversations c where c.lead_id = leads.id);   -- never touch a WhatsApp chat
create temp table demo_ids      on commit drop as
  select id from demo_accounts union all select id from demo_orders union all select id from demo_rmas
  union all select id from demo_leads;

-- notifications that open a demo record
delete from public.notifications n where exists (select 1 from demo_ids d where n.link like '%' || d.id::text || '%');

-- accounts: documents first, then orders, then the accounts
delete from public.credit_note_applications where order_id in (select id from demo_orders);
delete from public.credit_notes where account_id in (select id from demo_accounts);
delete from public.invoices where account_id in (select id from demo_accounts);
delete from public.escalations where account_id in (select id from demo_accounts);
delete from public.client_updates where account_id in (select id from demo_accounts);
delete from public.rmas where id in (select id from demo_rmas);
delete from public.rma_batches b where not exists (select 1 from public.rma_units u where u.batch_id = b.id);
delete from public.orders where id in (select id from demo_orders);
delete from public.price_lists where account_id in (select id from demo_accounts);
delete from public.account_price_rules where account_id in (select id from demo_accounts);
delete from public.accounts where id in (select id from demo_accounts);

-- leads (history cascades)
delete from public.leads where id in (select id from demo_leads);

-- what is left (the first five should be 0)
select (select count(*) from public.accounts) as accounts_left,
       (select count(*) from public.orders) as orders_left,
       (select count(*) from public.rmas) as rmas_left,
       (select count(*) from public.credit_notes) as credit_notes_left,
       (select count(*) from public.leads where email ~ '^demo[0-9]{2}@example\.com$') as demo_leads_left,
       (select count(*) from public.leads) as leads_kept,
       (select count(*) from public.price_lists where account_id is null) as base_lists_kept,
       (select count(*) from public.wa_conversations) as whatsapp_chats_kept;

commit;
