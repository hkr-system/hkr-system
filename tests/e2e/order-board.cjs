// Orders board browser test (Nov 3 2026): nine stages left to right, cards with what is missing, role scope, phone width.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset`.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
async function open(browser, name, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(BASE + '/login'); await page.waitForTimeout(1500);
  await page.fill('#email', `${name}.demo@hk-refurbished-stock.com`); await page.fill('#password', 'LocalDemo-2026!');
  await page.click('button[type=submit]'); await page.waitForURL('**/dashboard');
  await page.goto(BASE + '/sales/board'); await page.waitForSelector('[data-testid=order-board]', { timeout: 60000 }); await page.waitForTimeout(800);
  return page;
}
(async () => {
  const browser = await chromium.launch();
  const admin = await open(browser, 'gabriel', { width: 1440, height: 900 });
  const cols = await admin.$$eval('[data-testid^=col-]:not([data-testid$=-count])', (els) => els.map((e) => e.dataset.testid.replace('col-', '')));
  check(JSON.stringify(cols) === JSON.stringify(['quoted', 'invoiced', 'deposit_paid', 'in_preparation', 'ready_to_ship', 'balance_paid', 'shipped', 'delivered', 'closed']), 'nine stages left to right');
  check((await admin.locator('[data-testid=col-invoiced]').innerText()).includes('need action'), 'invoiced column flags orders needing action');
  check((await admin.locator('[data-testid=col-ready_to_ship] [data-testid=order-card]').first().innerText()).includes('Balance due'), 'ready to ship card says balance due');
  const all = await admin.locator('[data-testid=order-card]').count();
  await admin.locator('[data-testid=order-card]').first().click();
  await admin.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  check(true, 'a card opens its order');
  const bd = await open(browser, 'yessica', { width: 390, height: 844 });
  check((await bd.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'phone: no page-wide sideways scroll');
  const mine = await bd.locator('[data-testid=order-card]').count();
  check(mine > 0 && mine < all && !(await bd.locator('main').innerText()).includes('BER-DE-902'), `bd sees only her accounts (${mine} cards)`);
  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
