// Magic invoice creator (Nov 9 2026): a client order sheet with model headings and GB lines below is read line by
// line; "Cancel" clears the text and the report and puts the order lines back as they were. Read-only (creates nothing).
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
const SHEET = 'Order\n\niPhone 15 Pro Max\n- 256GB x2: 1 Natural Titanium, 1 Black Titanium\n- 512GB x1: 1 White Titanium\n\niPhone 15\n- 128GB x3: 2 Black, 1 Blue';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await page.goto(BASE + '/login'); await page.fill('#email', 'atreyi.demo@hk-refurbished-stock.com'); await page.fill('#password', PW);
  await page.click('button[type=submit]'); await page.waitForURL('**/dashboard');
  const { data: acc } = await admin.from('accounts').select('id').eq('code', 'AMS-NL-901').single();
  await page.goto(BASE + '/orders/new');
  await page.waitForSelector('[data-testid=order-account]', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.selectOption('[data-testid=order-account]', acc.id);
  const before = await page.locator('[data-testid=order-line]').count();
  check((await page.locator('[data-testid=magic-cancel]').count()) === 0, 'no Cancel while the box is empty');
  await page.fill('[data-testid=magic-reader] textarea', SHEET);
  await page.click('[data-testid=magic-read]');
  await page.waitForTimeout(400);
  check((await page.locator('[data-testid=magic-count]').innerText()).startsWith('3 line(s)'), 'order sheet with headings → 3 lines');
  const problems = await page.locator('[data-testid=magic-problems]').count();
  check(problems === 0 || !(await page.locator('[data-testid=magic-problems]').innerText()).includes('not found'), 'no "not found" problems');
  const after = await page.locator('[data-testid=order-line]').count();
  check(after === 3, `3 order lines filled (${after})`);
  await page.click('[data-testid=magic-cancel]');
  await page.waitForTimeout(300);
  check((await page.locator('[data-testid=magic-reader] textarea').inputValue()) === '', 'Cancel empties the text');
  check((await page.locator('[data-testid=magic-count]').count()) === 0 && (await page.locator('[data-testid=magic-problems]').count()) === 0, 'Cancel removes the report');
  check((await page.locator('[data-testid=order-line]').count()) === before, `Cancel puts the lines back (${before})`);
  await page.screenshot({ path: path.join(__dirname, '.screens/magic-cancel.png') });
  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
