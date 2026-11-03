// Pencil edit (Gabriel, Nov 3 2026): existing records are read-only until ✏️ Edit; Cancel discards; Save locks again.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE + '/login');
  await page.fill('#email', 'gabriel.demo@hk-refurbished-stock.com');
  await page.fill('#password', 'LocalDemo-2026!');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');

  // account set-up
  await page.goto(BASE + '/accounts/list');
  await page.waitForSelector('text=MIA-US-904');
  const href = await page.locator('a', { hasText: 'MIA-US-904' }).first().getAttribute('href');
  await page.goto(BASE + href + '?tab=edit');
  const lock = page.locator('[data-testid=lock-account]');
  await lock.waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  const name = lock.locator('input[name=name]');
  check(await name.isDisabled(), 'set-up is read-only at first');
  check(await lock.locator('button:has-text("Save")').count() === 0 || !(await lock.locator('button:has-text("Save")').first().isVisible()), 'no Save button while locked');
  await lock.locator('[data-testid=edit-unlock]').click();
  check(!(await name.isDisabled()), '✏️ Edit unlocks the fields');
  const original = await name.inputValue();
  await name.fill('Typo by mistake');
  await lock.locator('[data-testid=edit-cancel]').click();
  check(await lock.locator('input[name=name]').inputValue() === original && await lock.locator('input[name=name]').isDisabled(), 'Cancel puts the saved value back and locks');
  await lock.locator('[data-testid=edit-unlock]').click();
  await lock.locator('input[name=name]').fill('Miami Wireless Hub (demo) LLC');
  await lock.locator('button:has-text("Save")').first().click();
  await page.waitForTimeout(2500);
  check(await lock.getAttribute('data-editing') === '0', 'after Save the block is locked again');
  check((await page.locator('[data-testid=page-title]').innerText()).includes('Miami Wireless Hub (demo) LLC'), 'the change was saved');

  // a Settings section
  await page.goto(BASE + '/settings#operations');
  await page.waitForSelector('[data-testid=lock-operations]');
  await page.waitForTimeout(800);
  const first = page.locator('[data-testid=lock-operations] input:not([type=hidden]), [data-testid=lock-operations] textarea').first();
  check(await first.isDisabled(), 'Settings section read-only at first');
  await page.locator('[data-testid=lock-operations] [data-testid=edit-unlock]').click();
  check(!(await first.isDisabled()), '✏️ Edit unlocks the Settings section');

  // order page tabs: one panel at a time, instant switch, ?tab= kept
  await page.goto(BASE + '/accounts/list');
  await page.waitForSelector('text=MEX-MX-903');
  const mex = await page.locator('a', { hasText: 'MEX-MX-903' }).first().getAttribute('href');
  await page.goto(BASE + mex + '?tab=orders');
  await page.waitForSelector('text=ORD-01');
  const ord = await page.locator('a', { hasText: 'ORD-01' }).first().getAttribute('href');
  await page.goto(BASE + ord);
  await page.waitForSelector('[data-testid=order-tabs]', { timeout: 60000 });
  await page.waitForTimeout(800);
  check(await page.locator('[data-testid=lines-table]').isVisible() && !(await page.locator('[data-testid=payment-ledger]').isVisible()), 'order opens on Overview only');
  await page.click('[data-testid=tab-payments]');
  check(await page.locator('[data-testid=payment-ledger]').isVisible() && !(await page.locator('[data-testid=lines-table]').isVisible()), 'Payments tab shows the statement');
  check(page.url().includes('tab=payments'), 'the tab is kept in the address');
  check((await page.locator('[data-testid=ledger-due]').innerText()).includes('0.00') && (await page.locator('[data-testid=ind-due]').innerText()).includes('0.00'), 'paid order: nothing due in the statement and the indicator');
  await page.click('[data-testid=tab-intermediary]');
  check(await page.locator('[data-testid=order-intermediary]').isVisible(), 'Intermediary tab: the company can be chosen per order');

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
