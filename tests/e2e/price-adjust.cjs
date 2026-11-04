// Adjustable client prices (Gabriel, Nov 3 2026): the draft BER list is adjusted per row with colours; the specialist is
// refused below the floor; the admin sees base, real cost, margin and markup. Run after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SHOTS || '/tmp';
let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

async function login(browser, email) {
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  await page.goto(BASE + '/login');
  await page.fill('#email', email);
  await page.fill('#password', 'LocalDemo-2026!');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return page;
}
async function openBer(page) {
  await page.goto(BASE + '/price-lists');
  const link = page.locator('[data-testid="pl-BER-DE-902"] a[href^="/price-lists/"]').first();
  await link.waitFor({ timeout: 60000 });
  await page.goto(BASE + await link.getAttribute('href'));
  await page.waitForSelector('[data-testid=prices-card]', { timeout: 60000 });
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch();

  // specialist
  let page = await login(browser, 'atreyi.demo@hk-refurbished-stock.com');
  await openBer(page);
  check(!(await page.locator('[data-testid=prices-card]').innerText()).includes('Real cost'), 'specialist: no base / real cost / margin columns');
  const input = page.locator('[data-testid=price-input]').first();
  check(await input.isDisabled(), 'prices are locked until ✏️ Edit');
  await page.locator('[data-testid=lock-prices] [data-testid=edit-unlock]').click();
  const row = page.locator('[data-testid=pl-row]').first();
  const engine = Number((await input.inputValue()).replace(/,/g, ''));
  await input.fill((engine - 0.5).toFixed(2));
  check(await row.getAttribute('data-tone') === 'yellow', 'below the engine price → yellow while typing');
  await input.fill((engine + 50).toFixed(2));
  check(await row.getAttribute('data-tone') === 'green', 'well above → green');
  await input.fill('1.00');
  await page.click('[data-testid=save-prices]');
  await page.waitForTimeout(2500);
  check((await page.locator('[data-testid=lock-prices]').innerText()).includes('Below the floor'), 'specialist below the floor is refused');
  await page.locator('[data-testid=lock-prices] [data-testid=edit-cancel]').click().catch(() => {});
  await page.context().close();

  // admin
  page = await login(browser, 'gabriel.demo@hk-refurbished-stock.com');
  await openBer(page);
  const card = await page.locator('[data-testid=prices-card]').innerText();
  check(card.includes('Real cost') && card.includes('Margin') && card.includes('Markup'), 'admin: real cost, margin and markup columns');
  await page.locator('[data-testid=lock-prices] [data-testid=edit-unlock]').click();
  const ain = page.locator('[data-testid=price-input]').first();
  await ain.fill('1.00');
  check(await page.locator('[data-testid=pl-row]').first().getAttribute('data-tone') === 'red', 'below the real cost → red (admin)');
  const e2 = Number((await page.locator('[data-testid=pl-row]').first().locator('td').nth(4).innerText()).replace(/[$,]/g, ''));
  await ain.fill((e2 + 3).toFixed(2));
  await page.click('[data-testid=save-prices]');
  await page.waitForTimeout(3000);
  check((await page.locator('[data-testid=lock-prices]').innerText()).includes('1 price saved'), 'admin saves an adjusted price');
  check((await page.locator('[data-testid=price-summary]').innerText()).includes('1 adjusted'), 'summary counts the adjusted row');
  await page.screenshot({ path: path.join(DIR, 'pl-adjust-admin.png'), fullPage: true });

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
