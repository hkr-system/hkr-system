// Client price rules (Gabriel, Nov 3 2026): the specialist remembers a typed price as a rule, adds another rule on the account,
// prepares the list again and gets base + rule with the amounts to verify. Run after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SHOTS || '/tmp';
let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/login');
  await page.fill('#email', 'atreyi.demo@hk-refurbished-stock.com');
  await page.fill('#password', 'LocalDemo-2026!');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');

  // 1. BER draft: type a price on the first row and tick Remember
  await page.goto(BASE + '/price-lists');
  const link = page.locator('[data-testid="pl-BER-DE-902"] a[href^="/price-lists/"]').first();
  await link.waitFor({ timeout: 60000 });
  const listUrl = BASE + await link.getAttribute('href');
  const accUrl = BASE + (await page.locator('[data-testid="pl-BER-DE-902"] a[href^="/accounts/"]').first().getAttribute("href")).split("?")[0];
  await page.goto(listUrl);
  await page.waitForSelector('[data-testid=prices-card]', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.locator('[data-testid=lock-prices] [data-testid=edit-unlock]').click();
  const first = page.locator('[data-testid=pl-row]').first();
  const engine = Number((await first.locator('[data-testid=price-input]').inputValue()).replace(/,/g, ''));
  const typed = Math.round((engine + 7) * 100) / 100;
  await first.locator('[data-testid=price-input]').fill(typed.toFixed(2));
  await first.locator('[data-testid=remember]').check();
  await page.click('[data-testid=save-prices]');
  await page.waitForTimeout(3000);
  check((await page.locator('[data-testid=price-msg]').innerText()).includes('1 rule remembered'), 'Remember saves the rule');
  check(await page.locator('[data-testid=pl-row]').first().getAttribute('data-rule') === '1', 'the row now follows the rule');

  // 2. account tab: the rule is listed; add a second one
  await page.goto(accUrl + '?tab=price-lists');
  await page.waitForSelector('[data-testid=price-rules]', { timeout: 60000 });
  await page.waitForTimeout(800);
  check(await page.locator('[data-testid=rule-row]').count() === 1, 'account shows 1 price rule');
  await page.locator('[data-testid=lock-rules] [data-testid=edit-unlock]').click();
  const opt = await page.locator('[data-testid=rule-pick] option').nth(1).getAttribute('value');
  await page.selectOption('[data-testid=rule-pick]', opt);
  await page.locator('[data-testid=lock-rules] button:has-text("Add")').click();
  await page.locator('[data-testid=rule-amount]').nth(1).fill('15');
  await page.click('[data-testid=save-rules]');
  await page.waitForTimeout(3000);
  check(await page.locator('[data-testid=rule-row]').count() === 2, 'second rule saved');

  // 3. delete the draft and prepare again: both ruled models = base + rule, listed to verify
  await page.goto(listUrl);
  await page.waitForSelector('button:has-text("Delete draft")', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.click('button:has-text("Delete draft")');
  await page.waitForTimeout(3000);
  await page.goto(accUrl + '?tab=price-lists');
  await page.waitForSelector('[data-testid=account-price-lists]', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.locator('[data-testid=account-price-lists] button:has-text("Prepare")').first().click();
  await page.waitForURL('**/price-lists/**', { timeout: 60000 }).catch(() => {});
  if (!page.url().includes('/price-lists/')) {
    await page.reload(); await page.waitForTimeout(1500);
    await page.locator('[data-testid=account-price-lists] a:has-text("waiting for approval")').click();
  }
  await page.waitForSelector('[data-testid=rule-check]', { timeout: 60000 });
  check(await page.locator('[data-testid=rule-check-row]').count() === 2, 'new list: 2 prices from client rules, listed to verify');
  const firstPrice = Number((await page.locator('[data-testid=pl-row]').first().locator('[data-testid=price-input]').inputValue()).replace(/,/g, ''));
  check(Math.abs(firstPrice - typed) < 0.01, `same base → same price as remembered (${firstPrice} = ${typed})`);
  await page.screenshot({ path: path.join(DIR, 'pl-rules.png'), fullPage: true });

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
