// Dashboards browser test: Sales, Accounts health, Finance goals, menu counters, per role.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset`.
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.fill('#email', `${name}.demo@hk-refurbished-stock.com`);
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return { ctx, page };
}

const monthKey = new Date().toISOString().slice(0, 7);

(async () => {
  const browser = await chromium.launch();

  // Gabriel: Finance goals → Sales shows progress; menu counters
  {
    const { ctx, page } = await login(browser, 'gabriel');
    check((await page.textContent('[data-testid=nav-orders]')).includes('Sales'), 'menu says Sales');
    check((await page.textContent('[data-testid=badge-orders]')).trim() === '1', 'Sales counter = 1 payment to confirm');
    await page.goto(BASE + '/finance');
    const row = page.locator(`[data-testid=plan-${monthKey}]`);
    await row.locator('input[name=goal_company]').fill('500000');
    await row.locator('button:has-text("Save")').click();
    await row.locator('text=Saved').waitFor();
    check(true, 'company goal saved for this month');
    await page.locator('[data-testid=history-import] textarea').fill('2024-11  210000\n2024-12  250000\nbad line');
    await page.click('[data-testid=history-import] button');
    await page.waitForSelector('[data-testid=history-import] >> text=2 months saved');
    check(true, 'history pasted (2 months, 1 bad line reported)');
    await page.screenshot({ path: `${DIR}/finance.png`, fullPage: true });

    await page.goto(BASE + '/sales?period=365');
    await page.waitForSelector('[data-testid=revenue-chart]');
    check((await page.textContent('[data-testid=sales-kpis]')).includes('of $500,000.00'), 'Sales: progress against the company goal');
    check(!!(await page.$('text=Net margin')), 'admin sees net margin');
    await page.screenshot({ path: `${DIR}/sales-admin.png`, fullPage: true });
    await page.click('[data-testid=grain-day]');
    await page.waitForURL(/grain=day/);
    check((await page.locator('[data-testid=revenue-chart] .group').count()) > 300, 'daily view: one column per day');

    await page.goto(BASE + '/accounts');
    const h = await page.textContent('[data-testid=health-table]');
    check(h.includes('Needs attention') && h.includes('payment'), 'Accounts: health shows the payment to confirm');
    check(!!(await page.$('[data-testid=margin-share]')), 'admin: margin composition');
    await page.screenshot({ path: `${DIR}/accounts-admin.png`, fullPage: true });
    await ctx.close();
  }

  // Yessica (bd): own accounts, own margin, no Finance
  {
    const { ctx, page } = await login(browser, 'yessica');
    check(!(await page.$('[data-testid=nav-finance]')), 'bd: no Finance menu');
    await page.goto(BASE + '/accounts');
    const h = await page.textContent('[data-testid=health-table]');
    check(h.includes('AMS-NL-901') && !h.includes('BER-DE-902'), 'bd: only her accounts in the health table');
    check(!!(await page.$('[data-testid=margin-share]')), 'bd: margin of her accounts');
    await page.goto(BASE + '/sales?period=365');
    check((await page.textContent('[data-testid=sales-kpis]')).includes('your accounts'), 'bd: net margin labelled as her accounts');
    await page.screenshot({ path: `${DIR}/sales-bd.png`, fullPage: true });
    await page.goto(BASE + '/finance');
    check(!!(await page.$('[data-testid=no-access]')), 'bd: /finance shows No access');
    await ctx.close();
  }

  // Atreyi (specialist): no revenue, no margin
  {
    const { ctx, page } = await login(browser, 'atreyi');
    await page.goto(BASE + '/sales');
    check(!(await page.$('[data-testid=revenue-chart]')), 'specialist: no revenue chart (brief §8)');
    await page.goto(BASE + '/accounts');
    check(!(await page.$('[data-testid=margin-share]')), 'specialist: no margin composition');
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
