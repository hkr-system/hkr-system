-- Gabriel, Nov 3 2026: a deposit is NEVER overdue — orders are still taken after 20+ days and an order is only removed
-- when the client never pays. The dashboard no longer has a deposit alert, so the setting added this morning goes away.
delete from public.settings where key = 'deposit_overdue_days';
