// Door-to-door EUR price lists (Nov 18 2026, after `npm run db:reset`). INVENTED fees (public repo):
// admin sets up Global Connect in Settings (brackets + EUR shipping + small order + spread); on the EU client AMS-NL-901 the
// list comes out in EUR via Global Connect at a typed rate, with notes and WITHOUT the company's name; "Mark as sent" records it;
// a LATAM client gets no door-to-door option; the specialist cannot edit the fees.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { autoUnlock } = require('./unlock.cjs');
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
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await autoUnlock(ctx);
  const p = await ctx.newPage();
  await login(p, 'gabriel.demo@hk-refurbished-stock.com');

  // 1. admin sets up Global Connect
  await p.goto(BASE + '/settings#intermediaries');
  const card = p.locator('[data-testid=intermediary-row]').filter({ has: p.locator('input[value="Global Connect"]') });
  await card.waitFor({ timeout: 60000 });
  const ed = card.locator('[data-testid=d2d-editor]');
  await ed.locator('summary').click();
  await ed.locator('input[aria-label="Door to door on (Global Connect)"]').check();
  for (let i = 0; i < 2; i++) await ed.locator('[data-testid=d2d-add-bracket]').click();
  const br = ed.locator('[data-testid=d2d-bracket]');
  await br.nth(0).locator('input[aria-label="Up to € (Global Connect)"]').fill('300');
  await br.nth(0).locator('input[aria-label="Fee € per unit (Global Connect)"]').fill('7');
  await br.nth(1).locator('input[aria-label="Fee € per unit (Global Connect)"]').fill('12');
  await ed.locator('input[aria-label="Shipping per unit (Global Connect)"]').fill('2');
  await ed.locator('input[aria-label="Small order: under (pcs) (Global Connect)"]').fill('40');
  await ed.locator('input[aria-label="… + € per unit (Global Connect)"]').fill('1.5');
  await ed.locator('input[aria-label="Rate spread (e.g. 0.01) (Global Connect)"]').fill('0.02');
  await p.locator('[data-testid=save-intermediaries]').first().click();
  await p.waitForTimeout(2500);
  const { data: gc } = await admin.from('intermediaries').select('id, d2d').eq('name', 'Global Connect').single();
  check(gc.d2d?.enabled && gc.d2d.brackets.length === 2 && gc.d2d.brackets[0].up_to === 300 && gc.d2d.brackets[1].up_to === null && gc.d2d.fx_spread === 0.02,
    `set-up saved ${JSON.stringify(gc.d2d)}`);

  // 2. EU client: door to door via Global Connect at 1.10
  const { data: acc } = await admin.from('accounts').select('id').eq('code', 'AMS-NL-901').single();
  const { data: list } = await admin.from('price_lists').select('id').eq('account_id', acc.id).eq('brand', 'iphone').eq('status', 'approved').single();
  const { data: rows } = await admin.from('price_list_rows').select('model, storage_gb, price_usd').eq('price_list_id', list.id).order('price_usd').limit(1);
  await p.goto(`${BASE}/accounts/${acc.id}?tab=price-lists`);
  const sec = p.locator('[data-testid=pl-section-iphone]');
  await sec.locator('[data-testid=price-mode]').waitFor({ timeout: 60000 });
  await sec.locator('select[aria-label="Prices in"]').selectOption(gc.id);
  check((await sec.locator('[data-testid=rate-hint]').innerText()).includes('spread 0.02'), 'rate hint shows the official rate − spread');
  await sec.locator('input[aria-label="EUR to USD rate"]').fill('1.10');
  await sec.getByRole('button', { name: 'Text', exact: true }).click();
  await p.waitForFunction(() => { const t = document.querySelector('[data-testid=price-list-text]'); return t && t.value && !t.value.startsWith('Loading'); }, null, { timeout: 30000 });
  const txt = await p.locator('[data-testid=price-list-text]').inputValue();
  const usd = Number(rows[0].price_usd); const e0 = Math.round((usd / 1.1) * 100) / 100;
  const expect = (Math.round((e0 + (e0 <= 300 ? 7 : 12) + 2) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  check(txt.includes('EUR · Door to door') && txt.includes(`€${expect}`), `text in EUR with the right price (€${expect})`);
  check(txt.includes('1 EUR = 1.1000 USD') && txt.includes('Orders under 40 pcs: +€1.50 per unit.'), 'notes: rate and small orders');
  check(!/global connect/i.test(txt), 'the company name is NOT on the client list');
  await p.keyboard.press('Escape');
  const x = await p.request.get(`${BASE}/api/price-lists/${list.id}/xlsx?mode=d2d&via=${gc.id}&rate=1.10`);
  check(x.status() === 200 && (x.headers()['content-disposition'] ?? '').includes('_D2D-EUR.xlsx'), 'Excel door to door downloads');
  const pdf = await p.request.get(`${BASE}/api/price-lists/${list.id}/pdf?mode=d2d&via=${gc.id}&rate=1.10`);
  check(pdf.status() === 200, 'PDF door to door');
  const bad = await p.request.get(`${BASE}/api/price-lists/${list.id}/txt?mode=d2d&via=${gc.id}&rate=0`);
  check(bad.status() === 400, 'no rate → refused');

  // 3. mark as sent: door to door
  await sec.locator('[data-testid=mark-sent]').click();
  await sec.locator('select[aria-label="What was sent"]').selectOption(gc.id);
  await sec.locator('input[aria-label="Rate used"]').fill('1.1');
  await sec.locator('[data-testid=send-save]').click();
  await p.waitForFunction(() => document.querySelector('[data-testid=client-has-iphone]')?.textContent?.includes('door to door'), null, { timeout: 30000 });
  check((await p.locator('[data-testid=client-has-iphone]').innerText()).includes('EUR door to door via Global Connect @ 1.1000'), 'account: the client has the EUR door-to-door version');

  // 4. LATAM client: no door-to-door option
  const { data: mex } = await admin.from('accounts').select('id').eq('code', 'MEX-MX-903').single();
  await p.goto(`${BASE}/accounts/${mex.id}?tab=price-lists`); await p.waitForSelector('[data-testid=account-price-lists]', { timeout: 60000 });
  check((await p.locator('[data-testid=price-mode]').count()) === 0, 'LATAM client: USD only');

  // 5. specialist: no fee editor
  const s = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await login(s, 'atreyi.demo@hk-refurbished-stock.com');
  await s.goto(BASE + '/accounts/intermediaries'); await s.waitForSelector('[data-testid=intermediaries]', { timeout: 60000 });
  check((await s.locator('[data-testid=d2d-editor]').count()) === 0, 'specialist: no door-to-door fee editor');
  await b.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
