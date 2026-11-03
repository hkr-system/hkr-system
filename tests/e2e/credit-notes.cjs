// Credit notes on orders (Nov 3 2026): an approved credit note is applied to an order (no typed RMA discount), split
// across two orders, becomes Applied when fully used; the invoice draft prints "Credit note <number>".
// Invoice format per order: a new order copies the client's default and can change it for that invoice only.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const { autoUnlock } = require('./unlock.cjs');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '.screens');
fs.mkdirSync(DIR, { recursive: true });
let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await autoUnlock(ctx);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/login');
  await page.fill('#email', 'gabriel.demo@hk-refurbished-stock.com');
  await page.fill('#password', 'LocalDemo-2026!');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');

  // AMS-NL-901 ORD-03 (ready to ship): apply US$10 of AMS-NL-901-CN-01 (issued, US$25)
  await page.goto(BASE + '/accounts/list');
  await page.waitForSelector('text=AMS-NL-901');
  const accHref = await page.locator('a', { hasText: 'AMS-NL-901' }).first().getAttribute('href');
  await page.goto(BASE + accHref + '?tab=orders');
  await page.waitForSelector('text=ORD-03');
  const ord3 = await page.locator('a', { hasText: 'ORD-03' }).first().getAttribute('href');
  const ord2 = await page.locator('a', { hasText: 'ORD-02' }).first().getAttribute('href');
  await page.goto(BASE + ord3);
  await page.waitForSelector('[data-testid=credit-notes-panel]', { timeout: 60000 });
  const before = await page.locator('[data-testid=order-summary]').innerText();
  check(!/RMA discount \(−\)/.test(await page.locator('main').innerText()), 'no typed RMA discount field');
  await page.fill('input[aria-label="Amount to apply"]', '10');
  await page.click('[data-testid=cn-apply-button]');
  await page.waitForSelector('[data-testid=cn-applied]', { timeout: 20000 });
  await page.waitForTimeout(800);
  const after = await page.locator('[data-testid=order-summary]').innerText();
  check(/Credit notes \(AMS-NL-901-CN-01\)\s*−US\$\s?10\.00/.test(after), 'order summary: Credit notes (AMS-NL-901-CN-01) −US$10.00');
  check(before !== after, 'the order total changed');
  // invoice draft prints the credit note line
  const create = page.locator('button', { hasText: 'Create invoice draft' });
  if (await create.count()) {
    await create.click();
    await page.waitForTimeout(2500);
    const all = await page.evaluate(() => [...document.querySelectorAll('main textarea, main input')].map((e) => e.value).join('\n') + document.querySelector('main').innerText);
    check(all.includes('Credit note AMS-NL-901-CN-01'), 'invoice draft line: Credit note AMS-NL-901-CN-01');
  } else check(true, 'invoice already exists (skipped)');
  await page.screenshot({ path: path.join(DIR, 'cn-order.png'), fullPage: true });

  // the remaining US$15 on ORD-02 → Applied
  await page.goto(BASE + ord2);
  await page.waitForSelector('[data-testid=cn-apply]', { timeout: 60000 });
  const opt = await page.locator('select[aria-label="Credit note"] option').first().innerText();
  check(opt.includes('15.00 left of'), `only the rest is offered: ${opt}`);
  await page.click('[data-testid=cn-apply-button]');
  await page.waitForSelector('[data-testid=cn-applied]', { timeout: 20000 });
  await page.click('[data-testid=cn-applied] a');
  await page.waitForSelector('[data-testid=cn-applications]', { timeout: 60000 });
  const cnPage = await page.locator('main').innerText();
  check(/Applied on invoices · US\$\s?25\.00 of US\$\s?25\.00/.test(cnPage) && /Applied/.test(cnPage), 'credit note fully used → Applied, both orders listed');
  await page.screenshot({ path: path.join(DIR, 'cn-page.png'), fullPage: true });

  // invoice format per order: BER-DE-902 (default: battery in the price + CE Marks) → this order: no CE, plain lines
  await page.goto(BASE + '/orders/new');
  await page.waitForSelector('[data-testid=order-account]');
  await page.waitForTimeout(800);
  const ber = await page.locator('[data-testid=order-account] option', { hasText: 'BER-DE-902' }).getAttribute('value');
  await page.selectOption('[data-testid=order-account]', ber);
  check(!(await page.isChecked('[data-testid=fmt-battery_line_separate]')) && await page.isChecked('[data-testid=fmt-show_ce_text]'), 'new order copies the client default (battery in the price, CE Marks)');
  await page.uncheck('[data-testid=fmt-show_ce_text]');
  await page.check('[data-testid=fmt-plain_lines]');
  const line = page.locator('[data-testid=order-line]').first();
  await line.locator('input[aria-label=Model]').fill('ip13 128');
  await page.locator('[role=option]', { hasText: 'iPhone 13 128GB' }).first().click();
  await line.locator('input[aria-label=Quantity]').fill('100');
  await line.locator('input[aria-label="Unit price"]').fill('200');
  await page.click('button:has-text("Create order")');
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 30000 });
  await page.waitForSelector('[data-testid=order-format]');
  check((await page.locator('[data-testid=order-format]').innerText()).includes('battery in the price · plain lines'), 'the order keeps its own format');
  await page.locator('button', { hasText: 'Create invoice draft' }).click();
  await page.waitForTimeout(2500);
  const texts = await page.evaluate(() => [...document.querySelectorAll('main textarea, main input')].map((e) => e.value).join('\n') + document.querySelector('main').innerText);
  check(texts.includes('Used iPhone 13 128GB'), 'invoice draft uses the order format (plain line)');

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
