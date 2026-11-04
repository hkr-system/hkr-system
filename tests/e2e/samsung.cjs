// Samsung price lists browser test (Nov 4 2026): the admin uploads a Samsung base next to the iPhone base (names kept as in
// Samsung's file), prepares and approves a client's Samsung list (filed as [code]_PL-SAMSUNG_date) without touching its iPhone
// list; the account tab shows both; an order reads Samsung lines (no battery/CE, official colours); the client portal shows both.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { autoUnlock } = require('./unlock.cjs');
const ExcelJS = require('exceljs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '.screens');
fs.mkdirSync(DIR, { recursive: true });
const PW = 'LocalDemo-2026!';
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

async function login(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await autoUnlock(ctx);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/login');
  await page.fill('#email', `${name}.demo@hk-refurbished-stock.com`);
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return { ctx, page };
}
const goto = async (page, url, sel) => { await page.goto(BASE + url); await page.waitForSelector(sel, { timeout: 60000 }); await page.waitForTimeout(800); };

(async () => {
  // names typed like the real Samsung file; INVENTED prices
  const file = path.join(os.tmpdir(), 'Samsung_test.xlsx');
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['"NEW" grade A+++', 'GB', 'USD']);
  [['S22Ultra', 128, 111.4], ['NOTE 20 U 5G', 128, 99], ['S23FE   S711U', 128, 123], ['S24       S921U', 128, 222.123],
   ['S24 Ultra  S928U', 256, 333], ['S25+     ', 256, 444]].forEach((r) => ws.addRow(r));
  await wb.xlsx.writeFile(file);

  const browser = await chromium.launch();
  const { ctx, page } = await login(browser, 'gabriel');

  // 1. Two base cards; upload the Samsung base
  await goto(page, '/price-lists', '[data-testid=base-card-samsung]');
  const ipBefore = await page.locator('[data-testid=base-card]').innerText();
  check(ipBefore.includes('iPhone base list') && (await page.locator('[data-testid=base-card-samsung]').innerText()).includes('Samsung base list'), 'two base cards: iPhone and Samsung');
  await page.click('[data-testid=base-link-samsung]');
  await page.waitForSelector('input[type=file]', { timeout: 60000 });
  await page.waitForTimeout(800);
  check((await page.locator('[data-testid=page-title]').innerText()).includes('Samsung base list'), 'Samsung base page');
  await page.setInputFiles('input[type=file]', file);
  await page.click('button:has-text("Read file")');
  await page.waitForSelector('[data-testid=parsed-count]', { timeout: 30000 });
  const models = await page.locator('[data-testid=base-row] input[aria-label=Model]').evaluateAll((els) => els.map((e) => e.value));
  const notes = await page.locator('[data-testid=base-row] input[aria-label=Note]').evaluateAll((els) => els.map((e) => e.value));
  check(JSON.stringify(models) === JSON.stringify(['S22 Ultra', 'NOTE 20 U 5G', 'S23 FE', 'S24', 'S24 Ultra', 'S25+']), `names as in the file, spacing tidied (${models.join(' | ')})`);
  check(notes.includes('S921U') && notes.includes('S928U'), 'model codes kept as the note');
  check(!models.some((m) => m.startsWith('iPhone')), 'no "iPhone" added to Samsung names');
  await page.click('[data-testid=save-base]');
  await page.waitForURL(/\/price-lists\/[0-9a-f-]{36}$/, { timeout: 30000 });
  await page.waitForTimeout(800);
  check((await page.locator('[data-testid=page-title]').innerText()).includes('Samsung base list v2'), 'saved as Samsung base list v2');
  await goto(page, '/price-lists', '[data-testid=base-card]');
  check((await page.locator('[data-testid=base-card]').innerText()) === ipBefore, 'the iPhone base is untouched');

  // 2. Samsung client list for MEX-MX-903 (it has none): prepare from the Samsung tab and approve
  await goto(page, '/price-lists?brand=samsung', '[data-testid="pl-MEX-MX-903"]');
  check((await page.locator('[data-testid=brand-tab-samsung]').getAttribute('class')).includes('font-medium'), 'Samsung tab selected');
  await page.locator('[data-testid="pl-MEX-MX-903"] [data-testid=prepare-list-samsung]').click();
  await page.waitForSelector('[data-testid=prices-card]', { timeout: 60000 });
  check((await page.locator('[data-testid=page-title]').innerText()).includes('Samsung price list v1'), 'MEX Samsung price list v1 (draft)');
  const row = await page.locator('[data-testid=pl-row]').filter({ hasText: 'S24 S921U' }).first().innerText();
  check(row.includes('$222.12'), `Samsung row labelled as in the file: "S24 S921U" (base $222.12 visible to the admin)`);
  await page.click('[data-testid=approve-list]');
  await page.waitForSelector('[data-testid=filed] >> text=.pdf', { timeout: 60000 });
  check(/MEX-MX-903_PL-SAMSUNG_\d{4}-\d{2}-\d{2}\.pdf/.test(await page.locator('[data-testid=filed]').innerText()), 'filed as MEX-MX-903_PL-SAMSUNG_date');
  const id = page.url().split('/').pop();
  const wa = await page.evaluate(async (u) => (await fetch(u)).text(), `/api/price-lists/${id}/wa`);
  check(wa.includes('Samsung Price list') && wa.includes('*S24 Ultra S928U*'), 'WhatsApp text: Samsung title, names as in the file');

  // 3. AMS-NL-901 (demo: iPhone + Samsung lists): account tab shows both sections
  const { data: ams } = await admin.from('accounts').select('id').eq('code', 'AMS-NL-901').single();
  await goto(page, `/accounts/${ams.id}?tab=price-lists`, '[data-testid=pl-section-samsung]');
  check((await page.locator('[data-testid=pl-section-iphone]').innerText()).includes('iPhone · current list'), 'account tab: iPhone section');
  check((await page.locator('[data-testid=pl-section-samsung]').innerText()).includes('Samsung · current list'), 'account tab: Samsung section');
  await page.screenshot({ path: path.join(DIR, 'samsung-account-tab.png'), fullPage: true });

  // 4. Order for AMS: search a Samsung model, magic reader with colours; no battery/CE on Samsung lines
  await goto(page, '/orders/new', '[data-testid=order-account]');
  await page.selectOption('[data-testid=order-account]', ams.id);
  await page.waitForTimeout(500);
  check((await page.locator('[data-testid=order-form]').innerText()).includes('iPhone v1 · Samsung v1'), 'form names both approved lists');
  await page.fill('[data-testid=order-line] input[aria-label=Model]', 's24u');
  await page.locator('[role=option]', { hasText: 'S24 Ultra 256GB' }).first().click();
  check((await page.inputValue('[data-testid=order-line] input[aria-label="Unit price"]')) === '459', 'S24 Ultra price from the Samsung list (450 × 1.02)');
  check((await page.locator('[data-testid=samsung-no-options]').count()) === 1, 'Samsung line: no battery option, no CE');
  await page.fill('[data-testid=order-line] input[aria-label=Quantity]', '10');
  await page.fill('[data-testid=magic-reader] textarea', '20 Galaxy S23 128: 10 black, 10 lavender\n5 iPhone 13 128 mixed');
  await page.click('[data-testid=magic-read]');
  await page.waitForTimeout(300);
  check((await page.locator('[data-testid=order-line]').count()) === 3, 'magic reader added the S23 and the iPhone 13 line');
  const s23 = page.locator('[data-testid=order-line]').nth(1);
  check((await s23.locator('input[aria-label="Quantity Phantom Black"]').inputValue()) === '10' && (await s23.locator('input[aria-label="Quantity Lavender"]').inputValue()) === '10', 'S23 colours: Phantom Black 10, Lavender 10 (official names)');
  check((await s23.locator('input[aria-label="Unit price"]').inputValue()) === '204', 'S23 price from the Samsung list (200 × 1.02)');
  check((await page.locator('[data-testid=order-line]').nth(2).locator('[aria-label=Battery]').count()) > 0, 'iPhone line keeps the battery option');
  await page.screenshot({ path: path.join(DIR, 'samsung-order-form.png'), fullPage: true });
  await page.click('button:has-text("Create order")');
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const orderId = page.url().split('/').pop();
  const { data: lines } = await admin.from('order_lines').select('model, ce_marked, battery_option, price_source').eq('order_id', orderId);
  const sam = (lines || []).filter((l) => !l.model.startsWith('iPhone'));
  check(sam.length === 2 && sam.every((l) => !l.ce_marked && l.battery_option === null && l.price_source === 'list'), 'saved: Samsung lines without CE/battery, priced from the list');
  await ctx.close();

  // 5. Portal: AMS client sees both lists
  {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'daan@example.com' });
    if (error) throw error;
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await pctx.newPage();
    await p.goto(`${BASE}/portal/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
    await p.waitForURL(/\/portal$/);
    await p.goto(BASE + '/portal/price-list');
    await p.waitForSelector('[data-testid=portal-list-samsung]', { timeout: 60000 });
    check((await p.locator('[data-testid=portal-list-iphone]').count()) === 1, 'portal: iPhone list');
    check((await p.locator('[data-testid=portal-list-samsung]').innerText()).includes('S24 Ultra S928U'), 'portal: Samsung list, names as in the file');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, `portal price list fits a phone (${overflow}px)`);
    await p.screenshot({ path: path.join(DIR, 'samsung-portal.png'), fullPage: true });
    await pctx.close();
  }

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
