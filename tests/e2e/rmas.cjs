// Phase 4 + client portal browser test: RMA intake, IMEI check, approval with the 1 % cap,
// credit note (approve → issue → PDF), EU batch, portal login by link, RMA request with evidence.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
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

async function login(browser, name, viewport = { width: 1400, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/login');
  await page.fill('#email', `${name}.demo@hk-refurbished-stock.com`);
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return { ctx, page };
}

async function portalLogin(browser, email, viewport = { width: 1280, height: 900 }) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/portal/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
  await page.waitForURL(/\/portal$/);
  return { ctx, page };
}

const png = () => {
  const p = path.join(os.tmpdir(), 'evidence.png');
  fs.writeFileSync(p, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  return p;
};

(async () => {
  const browser = await chromium.launch();
  const rmaUrl = async (page, number) => {
    await page.goto(BASE + '/rmas?status=all');
    return page.locator(`[data-testid=rmas-table] a:has-text("${number}")`).getAttribute('href');
  };

  // Atreyi (account specialist): verify the portal RMA, cannot approve
  {
    const { ctx, page } = await login(browser, 'atreyi');
    check((await page.textContent('[data-testid=badge-rmas]').catch(() => '')).trim() !== '', 'RMAs menu shows a red counter');
    await page.goto(BASE + '/rmas');
    check((await page.locator('[data-testid=rmas-table] tbody tr').count()) === 3, 'specialist sees the 3 demo RMAs');
    check((await page.textContent('[data-testid=cutoff-banner]')).includes('Friday'), 'Friday cut-off banner');
    await page.goto(BASE + (await rmaUrl(page, 'AMS-NL-901-RMA-02')));
    const bad = page.locator('[data-testid=unit-row][data-imei="490154203237518"]');
    check((await bad.locator('[data-testid=imei-check]').textContent()) === 'NOT FOUND', 'unknown IMEI is NOT FOUND');
    check(!(await bad.locator('[data-testid=unit-resolution] option[value=return_hk]').count()), 'NOT FOUND unit cannot get a covered resolution');
    await bad.locator('[data-testid=unit-resolution]').selectOption('not_covered');
    await page.waitForTimeout(800);
    const ours = page.locator('[data-testid=unit-row]').filter({ has: page.locator('[data-testid=imei-check]:text-is("OURS")') });
    await ours.nth(0).locator('[data-testid=unit-resolution]').selectOption('return_hk');
    await page.waitForTimeout(800);
    await ours.nth(1).locator('[data-testid=unit-resolution]').selectOption('replacement');
    await page.waitForTimeout(800);
    await page.click('[data-testid=rma-to-verified]');
    await page.waitForSelector('[data-testid=rma-status]:text("Verified")');
    check(true, 'specialist marks the RMA verified');
    check((await page.textContent('[data-testid=rma-status-controls]')).includes('Waiting for an admin'), 'specialist cannot approve');
    await page.screenshot({ path: `${DIR}/rma-detail.png`, fullPage: true });

    await page.goto(BASE + '/rmas/batches');
    await page.waitForSelector('[data-testid=batch-board]');
    const stages = await page.$$eval('[data-testid$=-count]', (els) => els.map((e) => e.textContent));
    check(stages.length === 3 && stages[0] === '1 batch', `batch board: 3 stages, the seeded open batch in stage 1 (${stages.join(' / ')})`);
    const gc = page.locator('[data-testid="intermediary-Global Connect"]');
    check((await gc.locator('[data-testid=open-batch] li').count()) >= 2, 'Global Connect batch holds the approved units');
    const xlsx = await page.request.get(BASE + (await gc.locator('[data-testid=batch-xlsx]').getAttribute('href')));
    check(xlsx.status() === 200 && (xlsx.headers()['content-type'] || '').includes('spreadsheet'), 'consolidated batch xlsx downloads');
    await gc.locator('[data-testid=batch-awb]').fill('DHL 1234567890');
    await gc.locator('[data-testid=shipment-form] button:has-text("Save")').click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.locator('[data-testid="intermediary-Global Connect"] [data-testid=batch-shipped]').click();
    await page.waitForSelector('[data-testid=batch-message]');
    check((await page.textContent('[data-testid=batch-message]')).startsWith('Shipped'), 'batch marked shipped (email skipped without recipients/Brevo)');
    await ctx.close();
  }

  // Gabriel (admin): approve the MEX RMA above the cap, credit note approve → issue → PDF
  {
    const { ctx, page } = await login(browser, 'gabriel');
    await page.goto(BASE + (await rmaUrl(page, 'MEX-MX-903-RMA-01')));
    check(!!(await page.$('[data-testid=over-cap]')), 'credit above the 1 % cap is shown in red');
    await page.click('[data-testid=rma-to-approved]');
    await page.waitForSelector('[data-testid=rma-status]:text("Approved")');
    check(true, 'admin approves above the cap (warning, not a block)');
    await page.goto(BASE + '/rmas/credit-notes');
    await page.click('[data-testid=cn-table] a:has-text("MEX-MX-903-CN-01")');
    await page.click('[data-testid=cn-approve]');
    await page.waitForSelector('[data-testid=cn-issue]');
    await page.click('[data-testid=cn-issue]');
    await page.waitForSelector('[data-testid=cn-message]:has-text("Issued")');
    check((await page.textContent('[data-testid=cn-message]')).startsWith('Issued: PDF and xlsx saved'), 'credit note issued with PDF + xlsx stored');
    const pdf = await page.request.get(BASE + (await page.getAttribute('[data-testid=cn-pdf]', 'href')));
    check(pdf.status() === 200 && (pdf.headers()['content-type'] || '').includes('pdf') && (await pdf.body()).slice(0, 4).toString() === '%PDF', 'credit note PDF renders');
    await page.screenshot({ path: `${DIR}/credit-note.png`, fullPage: true });
    await page.goto(BASE + '/rmas/analytics');
    check((await page.textContent('body')).includes('Defect rate'), 'admin sees defect analytics');
    await ctx.close();
  }

  // Yessica (bd): no batches, no analytics
  {
    const { ctx, page } = await login(browser, 'yessica');
    await page.goto(BASE + '/rmas/batches');
    check(!!(await page.$('[data-testid=no-access]')), 'bd: EU batches are not for her');
    await page.goto(BASE + '/rmas/analytics');
    check(!!(await page.$('[data-testid=no-access]')), 'bd: no defect analytics');
    await ctx.close();
  }

  // Portal: Carlos (Spanish) sees his issued credit note and only his data
  {
    const { ctx, page } = await portalLogin(browser, 'carlos@example.com');
    check((await page.textContent('[data-testid=portal-title]')).includes('Bienvenido'), 'portal in Spanish for a Spanish account');
    await page.goto(BASE + '/portal/rmas');
    check((await page.textContent('[data-testid=portal-cns]')).includes('MEX-MX-903-CN-01'), 'client sees the issued credit note');
    check(!(await page.textContent('body')).includes('AMS-NL-901'), 'client never sees another account');
    await page.goto(BASE + '/dashboard');
    await page.waitForURL(/\/portal/);
    check(true, 'a client opening the internal app lands in the portal');
    await ctx.close();
  }

  // Portal: Daan (English) orders, IMEIs and a new RMA request with evidence, on a phone screen
  let sentNumber = null;
  {
    const { ctx, page } = await portalLogin(browser, 'daan@example.com', { width: 390, height: 844 });
    check((await page.textContent('[data-testid=portal-title]')).includes('Daan'), 'client is greeted by their contact name');
    await page.screenshot({ path: `${DIR}/portal-home-mobile.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, `portal home has no horizontal scroll on a phone (${overflow}px)`);
    await page.goto(BASE + '/portal/orders');
    await page.click('[data-testid=portal-orders] a:has-text("ORD-02")');
    check((await page.textContent('[data-testid=portal-imeis]')).includes('IMEIs (10)'), 'client sees the IMEIs of the order');
    const dl = await page.request.get(BASE + (await page.getAttribute('[data-testid=portal-imeis] a', 'href')));
    check(dl.status() === 200, 'client downloads the IMEI list');
    const { data: imeiRows } = await admin.from('imei_master').select('imei, orders!inner(number, accounts!inner(code))').eq('orders.number', 'ORD-02').eq('orders.accounts.code', 'AMS-NL-901');
    const good = imeiRows.map((r) => r.imei).sort()[5];
    const { data: other } = await admin.from('imei_master').select('imei, accounts!inner(code)').eq('accounts.code', 'BER-DE-902').limit(1);

    await page.goto(BASE + '/portal/rmas/new');
    const u1 = page.locator('[data-testid=rma-unit]').nth(0);
    await u1.locator('[data-testid=unit-imei]').fill(good);
    await u1.locator('[data-testid=imei-ok]').waitFor();
    check(true, 'own IMEI is recognised (model and order shown)');
    await u1.locator('[data-testid=unit-text]').fill('Screen flickers after 5 minutes');
    await u1.locator('[data-testid=unit-files]').setInputFiles(png());
    await page.click('[data-testid=add-unit]');
    const u2 = page.locator('[data-testid=rma-unit]').nth(1);
    await u2.locator('[data-testid=unit-imei]').fill(other[0].imei);
    await u2.locator('[data-testid=imei-warning]').waitFor();
    check(true, "another client's IMEI shows the 'not in our records' warning");
    await u2.locator('[data-testid=unit-files]').setInputFiles(png());
    await page.screenshot({ path: `${DIR}/portal-rma-form-mobile.png`, fullPage: true });
    await page.click('[data-testid=send-rma]');
    await page.waitForURL(/\/portal\/rmas\/.+\?sent=1/, { timeout: 30000 });
    sentNumber = (await page.textContent('h1')).trim();
    check((await page.textContent('[data-testid=rma-sent]')).includes('sent'), `request ${sentNumber} sent with evidence`);
    await ctx.close();
  }

  // Back office: the portal request arrived as "Form received" with evidence and the NOT FOUND unit
  {
    const { ctx, page } = await login(browser, 'atreyi');
    await page.goto(BASE + (await rmaUrl(page, sentNumber)));
    check((await page.textContent('[data-testid=rma-status]')) === 'Form received', 'portal request arrives as Form received');
    check((await page.locator('[data-testid=imei-check]:text-is("NOT FOUND")').count()) === 1, 'the foreign IMEI is NOT FOUND internally too');
    check((await page.locator('[data-testid=unit-row] img').count()) === 2, 'evidence photos are attached to each unit');
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
