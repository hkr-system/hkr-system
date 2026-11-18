// Modules per user (Nov 18 2026, after `npm run db:reset`): the admin unticks Leads and WhatsApp for Atreyi in Settings → Users;
// she no longer sees them (menu, pages, dashboard tile, account WhatsApp card) while the rest works; ticking them back restores.
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
const ATREYI = 'atreyi.demo@hk-refurbished-stock.com';
const login = async (page, email) => {
  await page.goto(BASE + '/login'); await page.fill('#email', email); await page.fill('#password', PW);
  await page.click('button[type=submit]'); await page.waitForURL('**/dashboard');
};
const menu = async (page) => (await page.locator('aside nav a, [data-testid=sidebar] a').allInnerTexts()).map((t) => t.replace(/\d+$/, '').trim());
const setModules = async (page, off) => {
  await page.goto(BASE + '/settings#users');
  const row = page.locator(`[data-testid="modules-${ATREYI}"]`);
  await row.waitFor({ timeout: 60000 });
  for (const label of ['Dashboard', 'Accounts', 'Sales', 'RMAs', 'Price lists', 'Leads', 'WhatsApp']) {
    const box = row.locator(`input[aria-label="${label} for ${ATREYI}"]`);
    if (off.includes(label)) await box.uncheck(); else await box.check();
  }
  await page.locator(`[data-testid="user-${ATREYI}"] button[type=submit]`).click();
  await page.locator(`[data-testid="user-${ATREYI}"] [aria-label=Saved]`).waitFor({ timeout: 30000 });
};

(async () => {
  const b = await chromium.launch();
  const actx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await autoUnlock(actx);   // Settings sections are read-only until ✏️ Edit
  const a = await actx.newPage();
  await login(a, 'gabriel.demo@hk-refurbished-stock.com');
  await setModules(a, ['Leads', 'WhatsApp']);
  const { data: prof } = await admin.from('profiles').select('sections').eq('email', ATREYI).single();
  check(JSON.stringify(prof.sections) === JSON.stringify(['dashboard', 'accounts', 'orders', 'rmas', 'price-lists']), `saved modules ${JSON.stringify(prof.sections)}`);

  const s = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await login(s, ATREYI);
  await s.waitForTimeout(1500);
  const m = await menu(s);
  check(!m.includes('Leads') && !m.includes('WhatsApp') && m.includes('Sales') && m.includes('Accounts'), `menu without Leads/WhatsApp: ${m.join(', ')}`);
  check((await s.getByText('Unanswered WhatsApp').count()) === 0, 'dashboard: no WhatsApp tile');
  for (const p of ['/leads', '/whatsapp']) {
    await s.goto(BASE + p); await s.waitForSelector('[data-testid=no-access]', { timeout: 20000 }).catch(() => {});
    check(!!(await s.$('[data-testid=no-access]')), `${p}: No access`);
  }
  const { data: acc } = await admin.from('accounts').select('id').eq('code', 'AMS-NL-901').single();
  await s.goto(`${BASE}/accounts/${acc.id}`); await s.waitForTimeout(2500);
  check((await s.getByRole('heading', { name: 'WhatsApp' }).count()) === 0, 'account page: no WhatsApp card');
  check((await s.getByText('Account Notes').count()) > 0, 'account page still works');
  await s.goto(BASE + '/orders'); await s.waitForTimeout(1500);
  check(!(await s.$('[data-testid=no-access]')), 'Sales still works');

  await setModules(a, []);
  const { data: prof2 } = await admin.from('profiles').select('sections').eq('email', ATREYI).single();
  check(prof2.sections === null, 'all ticked again = every module of the role (null)');
  await s.goto(BASE + '/leads'); await s.waitForTimeout(2000);
  check(!(await s.$('[data-testid=no-access]')), 'Leads back (read-only for the specialist)');
  await b.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
