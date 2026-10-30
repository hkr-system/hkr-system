// Invoices browser test (Oct 30 2026): issuer settings, draft by the specialist, approval by admin,
// "sent" stores PDF + xlsx in the order documents, reopen = new version, role limits.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '.screens');
fs.mkdirSync(DIR, { recursive: true });
const PW = 'LocalDemo-2026!';

let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

async function login(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/login');
  await page.fill('#email', `${name}.demo@hk-refurbished-stock.com`);
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return { ctx, page };
}

async function openOrder(page, code, number) {
  await page.goto(BASE + '/orders');
  const row = page.locator('[data-testid=orders-table] tr', { hasText: code }).filter({ hasText: number });
  await row.locator('a[href^="/orders/"]').first().click();
  await page.waitForSelector('[data-testid=invoice-panel]');
}

(async () => {
  const browser = await chromium.launch();

  // 1. Admin fills the issuer of Ever State (test data only) with a stamp
  {
    const { ctx, page } = await login(browser, 'gabriel');
    await page.goto(BASE + '/settings#invoices');
    const f = page.locator('[data-testid=issuer-ever_state]');
    await f.locator('input[name=company]').fill('Test Exporter Ltd');
    await f.locator('textarea[name=address]').fill('Unit 1, Test Building\nKowloon, Hong Kong');
    await f.locator('input[name=phone]').fill('+852 0000 0000');
    await f.locator('input[name=signer_name]').fill('Test Signer');
    await f.locator('input[name=signer_title]').fill('Business Development Director');
    await f.locator('textarea[name=bank_lines]').fill('Test Exporter Ltd\nAcct: TEST-000 | Test Bank');
    await f.locator('textarea[name=usdt_lines]').fill('Payment: USDT TRC-20\nTEST-WALLET-ADDRESS');
    await f.locator('input[type=file]').setInputFiles(path.join(__dirname, '../../public/brand/logo.png'));
    await page.waitForSelector('[data-testid=issuer-ever_state] img[alt="Company stamp"]');
    await f.locator('button[type=submit]').click();
    await f.locator('[aria-label=Saved]').waitFor();
    check(true, 'admin saved the Ever State issuer with a stamp');
    await ctx.close();
  }

  // 2. Specialist creates the draft, adjusts a description, cannot approve
  let orderUrl;
  {
    const { ctx, page } = await login(browser, 'atreyi');
    await openOrder(page, 'MEX-MX-903', 'ORD-03');
    orderUrl = page.url();
    await page.click('button:has-text("Create invoice draft")');
    await page.waitForSelector('[data-testid=invoice-status]');
    const number = (await page.textContent('[data-testid=invoice-number]')).trim();
    check(/^No\. \d{8}(-\d+)?$/.test(number), `draft numbered MMDDYYYY (${number})`);
    check((await page.textContent('[data-testid=invoice-status]')) === 'Draft', 'status Draft');
    const orderTotal = (await page.textContent('[data-testid=order-summary]')).match(/Invoice total\s*(?:US\$)?\s*([\d,.]+)/)?.[1];
    check((await page.textContent('[data-testid=invoice-total]')).includes(orderTotal), `invoice total = order total (${orderTotal})`);
    const desc = page.locator('input[aria-label="Line 1 description"]');
    const before = await desc.inputValue();
    check(/\/ \d+ GB \/ .*A\+\+\+/.test(before), `product line built from the SKU (${before})`);
    const descs = await page.$$eval('[data-testid=invoice-panel] input[aria-label$="description"]', (els) => els.map((e) => e.value));
    check(descs.includes('USDT Fee (0.85%)'), `USDT order shows the USDT fee line (${descs.join(' | ')})`);
    await desc.fill(before.replace(' GB / ', ' GB / Physical SIM / '));
    await page.click('button:has-text("Save draft")');
    await page.waitForSelector('[data-testid=invoice-message]');
    check(!(await page.$('[data-testid=invoice-panel] button:has-text("Approve")')), 'specialist has no Approve button');
    const pdf = await page.request.get(page.url().replace(/\/orders\/.*/, '') + (await page.getAttribute('a:has-text("PDF")', 'href')));
    check(pdf.status() === 200 && pdf.headers()['content-type'] === 'application/pdf', 'draft PDF downloads');
    await page.screenshot({ path: `${DIR}/invoice-draft.png`, fullPage: true });
    await ctx.close();
  }

  // 3. Admin approves and marks it sent → files in the order documents; then reopens (version 2)
  {
    const { ctx, page } = await login(browser, 'gabriel');
    await page.goto(orderUrl);
    await page.click('[data-testid=invoice-panel] button:has-text("Approve")');
    await page.waitForFunction(() => document.querySelector('[data-testid=invoice-status]')?.textContent === 'Approved');
    check(true, 'admin approved the invoice');
    const number = (await page.textContent('[data-testid=invoice-number]')).replace('No. ', '').trim();
    check((await page.textContent('main')).includes(`Our invoice ${number}`), 'order shows the approved invoice number');
    const href = await page.getAttribute('a:has-text("PDF")', 'href');
    const pdf = await page.request.get(BASE + href);
    fs.writeFileSync(path.join(DIR, 'invoice-approved.pdf'), await pdf.body());
    const xlsx = await page.request.get(BASE + href.replace('/pdf', '/xlsx'));
    fs.writeFileSync(path.join(DIR, 'invoice-approved.xlsx'), await xlsx.body());
    check(xlsx.status() === 200 && xlsx.headers()['content-disposition'].includes('_INV-HK.xlsx'), 'xlsx named [code]_ORD-NN_INV-HK');
    await page.click('button:has-text("Mark as sent to the client")');
    await page.waitForFunction(() => document.querySelector('[data-testid=invoice-status]')?.textContent === 'Sent');
    await page.reload();
    const docs = await page.textContent('main');
    check(docs.includes('MEX-MX-903_ORD-03_INV-HK.pdf') && docs.includes('MEX-MX-903_ORD-03_INV-HK.xlsx'), 'sent invoice stored in the order documents');
    check((await page.textContent('[data-testid=order-timeline]')).includes(`Invoice ${number} sent to the client`), 'timeline logs the sent invoice');
    await page.screenshot({ path: `${DIR}/invoice-sent.png`, fullPage: true });
    await page.click('button:has-text("Reopen as new version")');
    await page.waitForFunction(() => document.querySelector('[data-testid=invoice-status]')?.textContent === 'Draft');
    check((await page.textContent('[data-testid=invoice-panel]')).includes('version 2'), 'reopened as version 2');
    await ctx.close();
  }

  // 4. BD user can read invoices of her accounts but cannot prepare them
  {
    const { ctx, page } = await login(browser, 'yessica');
    await page.goto(BASE + '/orders');
    const link = page.locator('[data-testid=orders-table] a[href^="/orders/"]').first();
    if (await link.count()) {
      await link.click();
      await page.waitForSelector('[data-testid=invoice-panel]');
      check(!(await page.$('button:has-text("Create invoice draft")')), 'bd cannot create invoices');
    } else check(true, 'bd has no orders to open');
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
