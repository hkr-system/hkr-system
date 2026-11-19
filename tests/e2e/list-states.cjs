// Client price lists up to date (Nov 19 2026, after `npm run db:reset`): the dashboard card counts the clients per state
// (needs refresh · waiting for approval · not sent yet · up to date); each line opens Price lists filtered to those clients;
// marking the current list as sent moves the client to "Up to date". Specialist sees it too; bd only her accounts.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PW = 'LocalDemo-2026!';
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
const login = async (page, email) => {
  await page.goto(BASE + '/login'); await page.fill('#email', email); await page.fill('#password', PW);
  await page.click('button[type=submit]'); await page.waitForURL('**/dashboard');
};
const num = async (p, id) => Number((await p.locator(`[data-testid=${id}] span.tabular-nums`).innerText()).trim());

(async () => {
  const { data: acc } = await admin.from('accounts').select('id').eq('code', 'AMS-NL-901').single();
  const { data: list } = await admin.from('price_lists').select('id, version, valid_until').eq('account_id', acc.id).eq('brand', 'iphone').eq('status', 'approved').single();
  // keep the demo list valid so the client can be "up to date"
  await admin.from('price_lists').update({ valid_until: '2099-12-31' }).eq('id', list.id);
  await admin.from('price_lists').update({ valid_until: '2099-12-31' }).eq('account_id', acc.id).eq('brand', 'samsung').eq('status', 'approved');

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await login(p, 'gabriel.demo@hk-refurbished-stock.com');
  await p.waitForSelector('[data-testid=list-states]', { timeout: 60000 });
  const upBefore = Number((await p.locator('[data-testid=lists-up-to-date]').innerText()).split(' ')[0]);
  const notSentBefore = await num(p, 'lists-not_sent');
  check(notSentBefore >= 1, `dashboard: ${notSentBefore} client(s) with an approved list not sent yet`);

  await p.click('[data-testid=lists-not_sent]');
  await p.waitForURL(/state=not_sent/); await p.waitForSelector('[data-testid=list-state-filter]', { timeout: 60000 });
  const states = await p.locator('[data-testid=list-state]').allInnerTexts();
  check(states.length > 0 && states.every((s) => s === 'Not sent yet'), `price lists: filter shows only "Not sent yet" (${states.length})`);
  check((await p.locator('[data-testid=pl-AMS-NL-901]').count()) === 1, 'price lists: AMS-NL-901 is in the list to send');

  // the specialist marks it as sent (same as the "Mark as sent to the client" button)
  await admin.from('price_list_sends').insert({ price_list_id: list.id, sent_on: new Date().toISOString().slice(0, 10), channel: 'whatsapp' });
  const { data: sam } = await admin.from('price_lists').select('id').eq('account_id', acc.id).eq('brand', 'samsung').eq('status', 'approved').maybeSingle();
  if (sam) await admin.from('price_list_sends').insert({ price_list_id: sam.id, sent_on: new Date().toISOString().slice(0, 10), channel: 'whatsapp' });

  await p.goto(`${BASE}/price-lists?state=up_to_date`); await p.waitForSelector('[data-testid=list-state-filter]', { timeout: 60000 });
  const row = p.locator('[data-testid=pl-AMS-NL-901] [data-testid=client-has]');
  check((await row.count()) === 1 && (await row.innerText()).includes(`v${list.version}`) && (await row.innerText()).includes('WhatsApp'), 'price lists: AMS-NL-901 now Up to date, "Client has" shows version + channel');

  await p.goto(`${BASE}/dashboard`); await p.waitForSelector('[data-testid=list-states]', { timeout: 60000 });
  const upAfter = Number((await p.locator('[data-testid=lists-up-to-date]').innerText()).split(' ')[0]);
  check(upAfter === upBefore + 1, `dashboard: up to date ${upBefore} → ${upAfter}`);

  // phone width: no page-level horizontal scroll
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/price-lists`); await p.waitForSelector('[data-testid=list-state-filter]', { timeout: 60000 });
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no horizontal page scroll');
  await p.close();

  for (const email of ['atreyi.demo@hk-refurbished-stock.com', 'yessica.demo@hk-refurbished-stock.com']) {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await login(q, email);
    await q.waitForSelector('[data-testid=list-states]', { timeout: 60000 });
    const total = Number((await q.locator('[data-testid=lists-up-to-date]').innerText()).split(' ')[2]);
    check(total > 0, `${email.split('.')[0]}: dashboard card shows ${total} client(s)`);
    await q.close();
  }
  await b.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
