// Intermediaries (Nov 9 2026): Settings → Intermediaries adds / edits / removes companies (admin); the order form's
// Route offers "+ New intermediary…" (admin) and the next order of that client starts with it; specialists only pick.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { autoUnlock } = require('./unlock.cjs');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '.screens');
fs.mkdirSync(DIR, { recursive: true });
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
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await autoUnlock(ctx);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await login(page, 'gabriel.demo@hk-refurbished-stock.com');

  // Settings: add PGS Megastore with every field, refuse a duplicate name, remove an unused one
  await page.goto(BASE + '/settings#intermediaries');
  await page.waitForSelector('[data-testid=intermediaries]', { timeout: 60000 });
  await page.waitForTimeout(800);
  const last = () => page.locator('[data-testid=intermediary-row]').last();
  await page.click('[data-testid=add-intermediary]');
  await last().locator('input[aria-label="Company name *"]').fill('PGS Megastore');
  await last().locator('input[aria-label="VAT / EORI"]').fill('ESB12345678 · EORI ESB12345678');
  await last().locator('input[aria-label="Contact name"]').fill('Ana Demo');
  await last().locator('input[aria-label="Contact phone"]').fill('+34 600 000 000');
  await last().locator('input[aria-label="Email"]').fill('orders@pgs.example');
  await last().locator('textarea[aria-label=Address]').fill('Calle Demo 1, 28001 Madrid');
  await last().locator('select[aria-label=Country]').selectOption('ES');
  await page.click('[data-testid=save-intermediaries]');
  await page.waitForSelector('text=Saved (1 new).', { timeout: 30000 });
  await page.waitForTimeout(2500);   // the list reloads from the database after Save
  const { data: pgs } = await admin.from('intermediaries').select('vat_eori, contact, contact_phone, contact_email, address, country').eq('name', 'PGS Megastore').single();
  check(pgs && pgs.vat_eori.startsWith('ESB') && pgs.contact === 'Ana Demo' && pgs.contact_phone === '+34 600 000 000' && pgs.contact_email === 'orders@pgs.example' && pgs.address.includes('Madrid') && pgs.country === 'ES',
    'Settings: PGS Megastore saved with VAT/EORI, contact name, phone, email, address, country');
  await page.click('[data-testid=add-intermediary]');
  await last().locator('input[aria-label="Company name *"]').fill('pgs megastore');
  await page.click('[data-testid=save-intermediaries]');
  await page.waitForTimeout(1500);
  check((await page.locator('[data-testid=intermediaries]').innerText()).includes('twice in the list') || (await page.locator('[data-testid=intermediaries]').innerText()).includes('already an intermediary'), 'same name again (other case) is refused');
  await last().locator('input[aria-label="Company name *"]').fill('Typo Co');
  await page.click('[data-testid=save-intermediaries]');
  await page.waitForSelector('text=Saved (1 new).', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.locator('[data-testid=intermediary-row]', { has: page.locator('input[value="Typo Co"]') }).locator('button:has-text("Remove")').click();
  await page.waitForTimeout(2000);
  const { data: typo } = await admin.from('intermediaries').select('id').eq('name', 'Typo Co');
  check(!typo.length, 'an unused intermediary can be removed');
  check((await page.locator('[data-testid=intermediary-row]', { has: page.locator('input[value="Global Connect"]') }).locator('button:has-text("Remove")').count()) === 0, 'Global Connect (used) has no Remove');
  await page.screenshot({ path: path.join(DIR, 'intermediaries-settings.png'), fullPage: true });

  // order form: "+ New intermediary…" → Galimix, created with the order
  const { data: acc } = await admin.from('accounts').select('id').eq('code', 'AMS-NL-901').single();
  await page.goto(BASE + '/orders/new');
  await page.waitForSelector('[data-testid=order-account]', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.selectOption('[data-testid=order-account]', acc.id);
  check((await page.locator('[data-testid=order-route] option', { hasText: 'PGS Megastore' }).count()) === 1, 'order form lists PGS Megastore');
  await page.selectOption('[data-testid=order-route]', 'new');
  await page.fill('[data-testid=new-intermediary]', 'Galimix');
  await page.fill('[data-testid=magic-reader] textarea', '20 iPhone 15 128 mixed');
  await page.click('[data-testid=magic-read]');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Create order")');
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const orderId = page.url().split('/').pop();
  const { data: o } = await admin.from('orders').select('intermediary_id, intermediaries(name)').eq('id', orderId).single();
  check(o.intermediaries?.name === 'Galimix', 'order saved via Galimix (new intermediary created)');

  // next order of the same client starts with Galimix
  await page.goto(BASE + '/orders/new');
  await page.waitForSelector('[data-testid=order-account]', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.selectOption('[data-testid=order-account]', acc.id);
  await page.waitForTimeout(300);
  check((await page.locator('[data-testid=order-route]').inputValue()) === o.intermediary_id, "next order of the client starts via Galimix");

  // specialist: picks from the list, cannot add
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await login(p2, 'atreyi.demo@hk-refurbished-stock.com');
  await p2.goto(BASE + '/orders/new');
  await p2.waitForSelector('[data-testid=order-route]', { timeout: 60000 });
  await p2.waitForTimeout(800);
  check((await p2.locator('[data-testid=order-route] option[value=new]').count()) === 0, 'specialist: no "+ New intermediary…"');
  check((await p2.content()).includes('An admin adds it in Settings'), 'specialist: told where an admin adds one');
  check(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone width: no page-level horizontal scroll');

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
