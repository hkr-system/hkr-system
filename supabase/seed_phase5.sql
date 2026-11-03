-- Phase 5 demo data (dashboard queues): touches ONLY demo accounts (is_demo). Safe on hosted; no personal data.
--   • AMS-NL-901: a balance reminder on ORD-03 (yesterday) → the daily report says "reminded dd-mmm (1st)"
--   • MEX-MX-903: last week's Thursday update (ES) — this week it is due again
--   • 2 escalations: one open (discount request, answer due tomorrow), one answered by the SD
do $$
declare
  ams uuid := (select id from public.accounts where code = 'AMS-NL-901' and is_demo);
  mex uuid := (select id from public.accounts where code = 'MEX-MX-903' and is_demo);
  ber uuid := (select id from public.accounts where code = 'BER-DE-902' and is_demo);
  ams3 uuid; ber2 uuid;
  monday date := (now() at time zone 'Asia/Hong_Kong')::date - (extract(isodow from (now() at time zone 'Asia/Hong_Kong'))::int - 1);
begin
  if ams is null or mex is null then return; end if;
  select id into ams3 from public.orders where account_id = ams and number = 'ORD-03';
  select id into ber2 from public.orders where account_id = ber and number = 'ORD-02';

  if ams3 is not null then
    insert into public.client_updates (account_id, kind, week_start, order_ids, message, sent_at)
    values (ams, 'balance_reminder', monday, array[ams3], 'Balance reminder (demo)', now() - interval '1 day');
  end if;
  insert into public.client_updates (account_id, kind, week_start, language, message, sent_at)
  values (mex, 'thursday', monday - 7, 'es', E'Actualización semanal (demo)\n1. Estado: …\n2. Próximo paso: …\n3. Todo está en orden con sus unidades.', now() - interval '5 days');

  insert into public.escalations (account_id, order_id, topic, what_happened, figures, client_asks, proposal, answer_by)
  values (ams, ams3, 'discount', 'The client asks for 2 % off ORD-03 because the balance is paid within 24 hours.',
          '2 % of the invoice', '2 % discount on the balance', 'Keep the list price; offer nothing until the SD decides.',
          now() + interval '1 day');
  if ber2 is not null then
    insert into public.escalations (account_id, order_id, topic, what_happened, client_asks, proposal)
    values (ber, ber2, 'date', 'The client asks for a firm ready date for ORD-02; Hong Kong has not given one yet.',
            'A ready date this week', 'Tell the client we confirm on Friday after Hong Kong''s update.');
    update public.escalations set decision = 'Confirm on Friday; do not give a date before Hong Kong does.', status = 'closed'
     where account_id = ber and topic = 'date';
  end if;
end $$;
