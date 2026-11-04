// Phase 5 browser test (Nov 3 2026): dashboard per role, daily report (SOP P9 format, balance reminders),
// Thursday update queue in the account language, RMA ask queue, escalations to the SD (only admin answers).
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

async function login(browser, name, width = 1400) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.fill('#email', `${name}.demo@hk-refurbished-stock.com`);
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return { ctx, page };
}
const goto = async (page, url, sel) => { await page.goto(BASE + url); await page.waitForSelector(sel, { timeout: 60000 }); await page.waitForTimeout(800); };

(async () => {
  const browser = await chromium.launch();

  // 1. Admin dashboard + daily report
  {
    const { ctx, page } = await login(browser, 'gabriel');
    await goto(page, '/dashboard', '[data-testid=dashboard-tiles]');
    for (const id of ['alerts', 'rma-pending', 'sales-month', 'leads-by-stage', 'credit-notes', 'queues'])
      check(await page.locator(`[data-testid=${id}]`).count() === 1, `admin dashboard shows ${id}`);
    check((await page.locator('[data-testid=dashboard-tiles]').innerText()).includes('For the SD'), 'tile: For the SD');
    await page.screenshot({ path: path.join(DIR, 'dash-admin.png'), fullPage: true });

    await goto(page, '/dashboard/report', '[data-testid=report-orders-text]');
    const orders = await page.locator('[data-testid=report-orders-text]').innerText();
    check(/^Open orders:\n- /.test(orders) && orders.includes('Orders ready to ship:') && orders.includes('Pending balances:'), 'orders report: SOP sections');
    check(/AMS-NL-901 ORD-03 · \d+ pcs · ready · ETA/.test(orders), 'orders report: one line per order with stage and ETA');
    check(/AMS-NL-901 ORD-03 · USD [\d,]+\.\d\d · reminded \d\d-\w{3} \(1st\)/.test(orders), 'pending balance: reminded dd-mmm (1st)');
    const rmas = await page.locator('[data-testid=report-rmas-text]').innerText();
    check(rmas.startsWith("Open RMA's:") && rmas.includes('Closed today:'), "RMA report: SOP sections");
    await page.click('[data-testid=remind-balance]');
    await page.waitForSelector('text=Reminded today', { timeout: 20000 });
    await page.reload(); await page.waitForSelector('[data-testid=report-orders-text]');
    check((await page.locator('[data-testid=report-orders-text]').innerText()).includes('(2nd)'), 'after a reminder today: (2nd)');
    await page.click('[data-testid=copy-orders]');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(clip.startsWith('Open orders:'), 'Copy puts the block on the clipboard');
    await page.screenshot({ path: path.join(DIR, 'dash-report.png'), fullPage: true });
    await ctx.close();
  }

  // 2. Specialist: Thursday queue (ES for the Mexican client), RMA ask, escalation
  {
    const { ctx, page } = await login(browser, 'atreyi');
    await goto(page, '/dashboard/thursday', '[data-testid=thursday-queue]');
    const mex = page.locator('[data-testid="update-MEX-MX-903"]');
    check(await mex.getAttribute('data-sent') === '0', 'MEX: last week\'s update does not count this week');
    const draft = await mex.locator('[data-testid=update-text]').inputValue();
    check(draft.startsWith('Actualización semanal') && draft.includes('1. Estado: ') && /\n3\. /.test(draft), 'MEX draft in Spanish, three lines');
    const ber = await page.locator('[data-testid="update-BER-DE-902"] [data-testid=update-text]').inputValue();
    check(ber.startsWith('Weekly update') && ber.includes('ORD-03 invoice sent, waiting for the deposit'), 'BER draft in English from the status');
    await mex.locator('[data-testid=update-text]').fill(draft + '\nSaludos');
    await mex.locator('[data-testid=mark-sent]').click();
    await page.waitForSelector('[data-testid="update-MEX-MX-903"][data-sent="1"]', { timeout: 20000 });
    check(true, 'Mark as sent → done for this week');
    const askCard = page.locator('[data-testid=rma-ask-queue] [data-testid="update-AMS-NL-901"]');
    const ask = await askCard.locator('[data-testid=update-text]').inputValue();
    check(/through .+ closes on Friday \d+ \w+ at 12:00/.test(ask), 'RMA ask: clients of the intermediary with the Friday cut-off');
    await page.screenshot({ path: path.join(DIR, 'dash-thursday.png'), fullPage: true });

    await goto(page, '/dashboard/escalations', '[data-testid=decide-rule]');
    check((await page.locator('[data-testid=decide-rule]').innerText()).includes('a date Hong Kong has not given'), 'decide-alone rule shown (SOP P8)');
    await page.click('[data-testid=new-escalation] summary');
    const berId = await page.locator('select[name=account_id] option', { hasText: 'BER-DE-902' }).getAttribute('value');
    await page.selectOption('select[name=account_id]', berId);
    await page.selectOption('select[name=topic]', 'carrier');
    await page.fill('#esc-what', 'Client asks if the units work on Vodafone DE.');
    await page.fill('#esc-asks', 'Carrier compatibility answer');
    await page.click('[data-testid=escalation-submit]');
    await page.waitForSelector('text=Client asks if the units work on Vodafone DE.', { timeout: 20000 });
    check(await page.locator('[data-testid=decide-form]').count() === 0, 'specialist cannot answer');
    const esc = await page.locator('[data-testid=escalation]', { hasText: 'Vodafone' }).locator('pre').innerText();
    check(esc.startsWith('Client: BER-DE-902') && esc.includes('\nOrder: —\nInvoice value: —\nWhat happened: Client asks'), 'message in the SOP order (Client first)');
    await ctx.close();
  }

  // 3. bd: no daily report; leads + own sales
  {
    const { ctx, page } = await login(browser, 'yessica');
    await goto(page, '/dashboard', '[data-testid=dashboard-tiles]');
    check(!(await page.locator('[data-testid=section-tabs]').innerText()).includes('Daily report'), 'bd: no Daily report tab');
    check(await page.locator('[data-testid=credit-notes]').count() === 0 && await page.locator('[data-testid=leads-by-stage]').count() === 1, 'bd: leads yes, credit notes no');
    await page.goto(BASE + '/dashboard/report'); await page.waitForTimeout(1500);
    check((await page.locator('main').innerText()).includes('No access'), 'bd: daily report says No access');
    await ctx.close();
  }

  // 4. Admin answers the escalation; phone width
  {
    const { ctx, page } = await login(browser, 'gabriel', 390);
    await goto(page, '/dashboard/escalations', '[data-testid=escalation-list]');
    const card = page.locator('[data-testid=escalation]', { hasText: 'Vodafone' });
    await card.locator('textarea[name=decision]').fill('Escalate to HK: confirm bands before answering.');
    await card.locator('[data-testid=decide-close]').click();
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid=escalation]')].some((e) => e.textContent.includes('Vodafone')), null, { timeout: 20000 });
    await goto(page, '/dashboard/escalations?status=closed', '[data-testid=escalation-list]');
    check((await page.locator('[data-testid=decision]').allInnerTexts()).some((t) => t.includes('confirm bands')), 'answered escalation shows the decision');
    await goto(page, '/dashboard', '[data-testid=dashboard-tiles]');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= 392, `phone width: no horizontal page scroll (${sw})`);
    await page.screenshot({ path: path.join(DIR, 'dash-phone.png'), fullPage: true });
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
