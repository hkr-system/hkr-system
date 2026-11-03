// Price lists browser test (Phase 6A, Nov 2 2026): base upload (messy names) → new version; admin prepares and
// approves a client list (files filed); outputs (xlsx, pdf, text, WhatsApp); specialist prepares but cannot approve
// and never sees the base; bd sees approved lists + floors of her accounts; order prices come from the list.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '.screens');
fs.mkdirSync(DIR, { recursive: true });
const PW = 'LocalDemo-2026!';

let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

async function login(browser, name, width = 1400) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
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
  // a test file in the iPhonePrices layout (invented prices, names typed like the real file)
  const file = path.join(os.tmpdir(), 'iPhonePrices_test.xlsx');
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['"NEW" grade A+++', 'GB', 'USD']);
  [['iPhone 13mini  ', 128, 220.4], ['iPhone 13', 128, 271.575], ['iPhone 15  (esim+regular sim)', 128, 400.111],
   ['iPhone 15 PM 256 (esim+regular sim)', 256, 640], ['iPhone 16 Pro max (esim+regular sim)', 256, 750.5]].forEach((r) => ws.addRow(r));
  await wb.xlsx.writeFile(file);

  const browser = await chromium.launch();

  // 1. Admin uploads a new base list
  {
    const { ctx, page } = await login(browser, 'gabriel');
    await goto(page, '/price-lists/base', 'input[type=file]');
    await page.setInputFiles('input[type=file]', file);
    await page.click('button:has-text("Read file")');
    await page.waitForSelector('[data-testid=parsed-count]', { timeout: 30000 });
    check((await page.locator('[data-testid=base-row]').count()) === 5, 'base upload: 5 rows read');
    const models = await page.locator('[data-testid=base-row] input[aria-label=Model]').evaluateAll((els) => els.map((e) => e.value));
    check(models.includes('iPhone 13 mini') && models.includes('iPhone 15 Pro Max'), 'model names normalized (13 mini, PM → Pro Max)');
    await page.screenshot({ path: path.join(DIR, 'pl-base-preview.png'), fullPage: true });
    await page.click('[data-testid=save-base]');
    await page.waitForURL(/\/price-lists\/[0-9a-f-]{36}$/, { timeout: 30000 });
    await page.waitForTimeout(800);
    check((await page.locator('[data-testid=page-title]').innerText()).includes('Base list v2'), 'saved as base list v2');

    // 2. Admin prepares MEX-MX-903 (demo history: closed orders, no RMA cost → floor 0.50 %; 2+ orders → suggestion) and approves
    await goto(page, '/price-lists', '[data-testid="pl-MEX-MX-903"]');
    await page.locator('[data-testid="pl-MEX-MX-903"] [data-testid=prepare-list]').click();
    await page.waitForSelector('[data-testid=engine-card]', { timeout: 60000 });
    const engine = await page.locator('[data-testid=engine-card]').innerText();
    check(/RMA_c\): 0\.50 %/.test(engine) && /Below the 0\.50 % floor/.test(engine), 'RMA_c: clean history → 0.50 % floor, explained');
    check(/Extra_c\): 0\.50 %/.test(engine) && /No data yet/.test(engine) && /Score 1/.test(engine), 'Extra_c: suggestion from the signals (no-data signals give 0)');
    const first = await page.locator('[data-testid=pl-row]').filter({ hasText: 'iPhone 15 (esim+regular sim)' }).innerText();
    check(first.includes('$400.11') && first.includes('$404.11') && first.includes('$402.11'), 'iPhone 15 128: base 400.11 → list 404.11 (+1 %), floor 402.11 (+0.5 %)');
    await page.screenshot({ path: path.join(DIR, 'pl-draft-admin.png'), fullPage: true });
    await page.click('[data-testid=approve-list]');
    await page.waitForSelector('[data-testid=filed] >> text=.pdf', { timeout: 60000 });
    const filed = await page.locator('[data-testid=filed]').innerText();
    check(/MEX-MX-903_PL_\d{4}-\d{2}-\d{2}\.pdf/.test(filed) && filed.includes('.xlsx'), 'approved: [code]_PL_date .xlsx + .pdf filed in the account');
    const id = page.url().split('/').pop();

    // 3. Outputs
    const wa = await page.evaluate(async (u) => (await fetch(u)).text(), `/api/price-lists/${id}/wa`);
    check(wa.startsWith('*HK Refurbished Stock · Price list') && wa.includes('*iPhone 15 Pro Max (esim+regular sim)*') && wa.includes('256GB — $'), 'WhatsApp text: bold headers, one line per SKU');
    check(!/floor/i.test(wa), 'WhatsApp text has no floor');
    const pdf = await page.evaluate(async (u) => { const r = await fetch(u); return [r.status, r.headers.get('content-type')]; }, `/api/price-lists/${id}/pdf`);
    check(pdf[0] === 200 && pdf[1] === 'application/pdf', 'PDF downloads');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('a:has-text("Excel")')]);
    const x = new ExcelJS.Workbook(); await x.xlsx.readFile(await dl.path());
    const s = x.worksheets[0];
    check(s.getCell('A1').value === '"NEW" grade A+++' && s.getCell('B1').value === 'GB' && s.getCell('C1').value === 'USD', 'Excel in the iPhonePrices layout');
    await page.click('button:has-text("WhatsApp text")');
    await page.waitForFunction(() => document.querySelector('[data-testid=price-list-text]')?.value.startsWith('*'));
    await page.screenshot({ path: path.join(DIR, 'pl-whatsapp.png') });
    await page.keyboard.press('Escape');

    // account tab
    await page.goto(BASE + '/price-lists');
    await page.waitForSelector('[data-testid="pl-MEX-MX-903"]');
    const mexId = await page.locator('[data-testid="pl-MEX-MX-903"] a').first().getAttribute('href');
    await goto(page, mexId, '[data-testid=account-price-lists]');
    check((await page.locator('[data-testid=account-price-lists]').innerText()).includes('Version 1'), 'account tab shows the current list');
    await ctx.close();
  }

  // 4. Specialist: prepares MIA-US-904, cannot approve, never sees the base
  {
    const { ctx, page } = await login(browser, 'atreyi');
    await goto(page, '/price-lists', '[data-testid="pl-MIA-US-904"]');
    check((await page.locator('[data-testid=base-card]').count()) === 0, 'specialist: no base list card');
    await page.locator('[data-testid="pl-MIA-US-904"] [data-testid=prepare-list]').click();
    await page.waitForSelector('[data-testid=engine-card]', { timeout: 60000 });
    check((await page.locator('[data-testid=approve-list]').count()) === 0, 'specialist cannot approve');
    check(!(await page.locator('main').innerText()).includes('Base US$'), 'specialist sees no base prices');
    check((await page.locator('[data-testid=percent-form]').count()) === 0, 'specialist cannot change the percentages');
    const base = await page.evaluate(async () => (await fetch('/price-lists/base')).status);
    const r = await page.evaluate(async () => (await (await fetch('/price-lists/base')).text()).includes('No access'));
    check(base === 200 && r, 'specialist: base page says No access');
    await ctx.close();
  }

  // 5. bd (Yessica) sees approved lists of her accounts with floors, and no drafts
  {
    const { ctx, page } = await login(browser, 'yessica');
    await goto(page, '/price-lists', 'h1');
    check((await page.locator('[data-testid=list-status]').count()) === 0 && !(await page.locator('main').innerText()).includes('BER-DE-902'), 'bd sees no drafts (BER draft hidden)');
    const ams = page.locator('[data-testid="pl-AMS-NL-901"]');
    if (await ams.count()) {
      await ams.locator('a', { hasText: 'v1' }).click();
      await page.waitForSelector('[data-testid=pl-row]');
      check((await page.locator('main').innerText()).includes('Floor US$'), 'bd sees the floor of her account');
    } else check(true, 'AMS not assigned to this bd (nothing to show)');
    await ctx.close();
  }

  // 6. Order prices come from the approved list (AMS-NL-901, demo list v1: iPhone 15 128 = 395 × 1.02 = 402.90)
  {
    const { ctx, page } = await login(browser, 'gabriel');
    await goto(page, '/orders/new', '[data-testid=order-account]');
    const ams = await page.locator('[data-testid=order-account] option', { hasText: 'AMS-NL-901' }).getAttribute('value');
    await page.selectOption('[data-testid=order-account]', ams);
    const sku = await page.locator('[data-testid=order-line] select[aria-label=Model] option', { hasText: 'iPhone 15 128GB' }).first().getAttribute('value');
    await page.selectOption('[data-testid=order-line] select[aria-label=Model]', sku);
    check((await page.inputValue('[data-testid=order-line] input[aria-label="Unit price"]')) === '402.9', 'unit price filled from the list (402.90)');
    check((await page.locator('[data-testid=price-hint]').innerText()).includes('From the price list'), 'line marked "from the price list"');
    await page.fill('[data-testid=order-line] input[aria-label="Unit price"]', '390');
    check((await page.locator('[data-testid=price-hint]').innerText()).includes('below the floor'), 'below the floor → warning');
    await page.fill('[data-testid=order-line] input[aria-label=Quantity]', '60');
    // Magic invoice creator adds lines read from the client's message
    await page.fill('[data-testid=magic-reader] textarea', '20 x iPhone 13 128 mixed');
    await page.click('[data-testid=magic-read]');
    check((await page.locator('[data-testid=order-line]').count()) === 2, 'magic reader added the iPhone 13 line');
    await page.screenshot({ path: path.join(DIR, 'pl-order-form.png'), fullPage: true });
    await page.click('button:has-text("Create order")');
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 30000 });
    check(true, 'order saved with a manual price below the floor (warning, not a block)');
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
