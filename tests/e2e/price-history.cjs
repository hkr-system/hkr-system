// Price list history + "Mark as sent" (Nov 18 2026, after `npm run db:reset`): the account tab says which version the client
// has; marking the current list as sent updates it; History shows every version with ★ on the one the client has; an order
// priced from the list shows the version used and the one sent (and warns when they differ).
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

(async () => {
  const { data: acc } = await admin.from('accounts').select('id').eq('code', 'AMS-NL-901').single();
  const { data: list } = await admin.from('price_lists').select('id, version').eq('account_id', acc.id).eq('brand', 'iphone').eq('status', 'approved').single();
  const { data: row } = await admin.from('price_list_rows').select('id, model, storage_gb, price_usd').eq('price_list_id', list.id).limit(1).single();
  // an order whose line takes its price from the list
  const { data: ord } = await admin.from('orders').insert({ account_id: acc.id, order_date: new Date().toISOString().slice(0, 10) }).select('id').single();
  await admin.from('order_lines').insert({ order_id: ord.id, account_id: acc.id, model: row.model, storage_gb: row.storage_gb, qty: 10, unit_price_usd: row.price_usd, colors_mixed: true, price_list_row_id: row.id });
  const { data: ol } = await admin.from('order_lines').select('price_list_row_id').eq('order_id', ord.id).single();
  check(!!ol.price_list_row_id, 'demo order line linked to the client list');

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await login(p, 'gabriel.demo@hk-refurbished-stock.com');
  await p.goto(`${BASE}/orders/${ord.id}`); await p.waitForSelector('[data-testid=order-list-versions]', { timeout: 60000 });
  check((await p.locator('[data-testid=list-version-warning]').count()) > 0, 'order: warns that the list was never sent to the client');
  check((await p.locator('[data-testid=order-list-versions]').first().innerText()).includes(`prices from v${list.version}`), 'order: shows the version the prices came from');

  await p.goto(`${BASE}/accounts/${acc.id}?tab=price-lists`); await p.waitForSelector('[data-testid=client-has-iphone]', { timeout: 60000 });
  check((await p.locator('[data-testid=client-has-iphone]').innerText()).includes('never sent'), 'account: "The client was never sent a list"');
  await p.locator('[data-testid=pl-section-iphone] [data-testid=mark-sent]').first().click();
  await p.locator('[data-testid=pl-section-iphone] select[aria-label="Sent by"]').selectOption('email');
  await p.locator('[data-testid=pl-section-iphone] [data-testid=send-save]').click();
  await p.waitForFunction(() => document.querySelector('[data-testid=client-has-iphone]')?.textContent?.includes('up to date'), null, { timeout: 30000 });
  check((await p.locator('[data-testid=client-has-iphone]').innerText()).includes(`v${list.version}`), 'account: after "Mark as sent" the client has the current version (up to date)');
  check((await p.locator('[data-testid=pl-section-iphone] [data-testid=version-sent]').first().innerText()).includes('Email'), 'versions table: sent date + channel');

  await p.goto(`${BASE}/orders/${ord.id}`); await p.waitForSelector('[data-testid=order-list-versions]', { timeout: 60000 });
  check((await p.locator('[data-testid=list-version-warning]').count()) === 0 && (await p.locator('[data-testid=order-list-versions]').first().innerText()).includes('sent to the client: v'),
    'order: no warning once the used version was sent');

  await p.goto(`${BASE}/price-lists/history`); await p.waitForSelector('[data-testid=history-table]', { timeout: 60000 });
  const n = await p.locator('[data-testid=history-row]').count();
  check(n >= 4, `history: every version listed (${n} rows, base included for the admin)`);
  check((await p.locator('[data-testid=client-has]').count()) === 1, 'history: ★ on the version the client has');
  await p.locator('select[aria-label=Client]').selectOption(acc.id);
  await p.locator('[data-testid=history-filters] button[type=submit]').click();
  await p.waitForURL(/account=/);
  await p.waitForSelector('[data-testid=history-row]');
  const codes = await p.locator('[data-testid=history-row] td:first-child a').allInnerTexts();
  check(codes.length > 0 && codes.every((c) => c === 'AMS-NL-901'), 'history: filter by client');
  await p.goto(`${BASE}/price-lists/${list.id}`); await p.waitForSelector('[data-testid=sends-card]', { timeout: 60000 });
  check((await p.locator('[data-testid=list-send]').count()) === 1, 'list page: "Sent to the client" shows the send');

  // the specialist sees the history without the base list
  const s = await b.newPage({ viewport: { width: 390, height: 844 } });
  await login(s, 'atreyi.demo@hk-refurbished-stock.com');
  await s.goto(`${BASE}/price-lists/history`); await s.waitForSelector('[data-testid=history-table]', { timeout: 60000 });
  check(!(await s.locator('[data-testid=history-table]').innerText()).includes('Base list'), 'specialist: no base lists in the history');
  check(await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone width: no page-level horizontal scroll');
  await b.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
