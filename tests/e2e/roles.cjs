// Browser test: logs in as each demo user and checks the menu, the Settings guard,
// settings editing and sign-out. Needs the app on http://localhost:3000 (npm run build && npm start)
// against LOCAL Supabase (npm run db:reset) and Playwright available (pre-installed in Claude's workspace).
// Screenshots go to SCREENSHOT_DIR (default: ./tests/e2e/.screens).
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SCREENSHOT_DIR || require('path').join(__dirname, '.screens');
require('fs').mkdirSync(DIR, { recursive: true });
const PW = 'LocalDemo-2026!';
const users = [
  { name: 'gabriel', role: 'Admin', expect: ['dashboard','accounts','orders','rmas','price-lists','leads','whatsapp','settings'] },
  { name: 'yessica', role: 'Business development', expect: ['dashboard','accounts','orders','rmas','price-lists','leads','whatsapp'] },
  { name: 'arslan', role: 'Business development', expect: ['dashboard','accounts','orders','rmas','price-lists','leads','whatsapp'] },
  { name: 'atreyi', role: 'Account specialist', expect: ['dashboard','accounts','orders','rmas','price-lists','leads','whatsapp'] },
];
(async () => {
  const browser = await chromium.launch();
  let fail = 0;
  const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
  // logged out → login redirect
  {
    const page = await browser.newPage();
    await page.goto(BASE + '/settings');
    check(page.url().includes('/login?next=%2Fsettings'), 'logged-out visitor sent to login: ' + page.url());
    await page.fill('#email', 'gabriel.demo@hk-refurbished-stock.com');
    await page.fill('#password', 'wrong');
    await page.click('button[type=submit]');
    await page.waitForSelector('p[role=alert]');
    check((await page.textContent('p[role=alert]')).includes('Wrong email or password'), 'wrong password shows error');
    await page.close();
  }
  for (const u of users) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/login');
    await page.fill('#email', `${u.name}.demo@hk-refurbished-stock.com`);
    await page.fill('#password', PW);
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard');
    const nav = await page.$$eval('aside [data-testid^=nav-]', els => els.map(e => e.dataset.testid.replace('nav-','')));
    check(JSON.stringify(nav) === JSON.stringify(u.expect), `${u.name}: menu = ${nav.join(', ')}`);
    check((await page.textContent('[data-testid=user-role]')).trim() === u.role, `${u.name}: role label ${u.role}`);
    await page.screenshot({ path: `${DIR}/${u.name}-dashboard.png` });
    await page.goto(BASE + '/settings');
    const noAccess = await page.$('[data-testid=no-access]');
    if (u.name === 'gabriel') {
      check(!noAccess, 'gabriel: settings opens');
      const conf = await page.$('[data-testid=setting-engine_rma_cap_pct]');
      check(!!conf, 'gabriel: sees confidential engine parameter');
      // edit a setting and restore
      const row = page.locator('[data-testid=setting-thursday_weekday]');
      await row.locator('input[name=value]').fill('3');
      await row.locator('button[type=submit]').click();
      await row.locator('[aria-label=Saved]').waitFor();
      await page.reload();
      check(await page.locator('[data-testid=setting-thursday_weekday] input[name=value]').inputValue() === '3', 'gabriel: setting saved');
      await page.locator('[data-testid=setting-thursday_weekday] input[name=value]').fill('abc');
      await page.locator('[data-testid=setting-thursday_weekday] button[type=submit]').click();
      await page.locator('[data-testid=setting-thursday_weekday] .text-destructive').waitFor();
      check(true, 'gabriel: invalid number rejected');
      await page.locator('[data-testid=setting-thursday_weekday] input[name=value]').fill('4');
      await page.locator('[data-testid=setting-thursday_weekday] button[type=submit]').click();
      await page.locator('[data-testid=setting-thursday_weekday] [aria-label=Saved]').waitFor();
      await page.screenshot({ path: `${DIR}/gabriel-settings.png`, fullPage: true });
    } else {
      check(!!noAccess, `${u.name}: /settings shows No access`);
      await page.screenshot({ path: `${DIR}/${u.name}-settings.png` });
    }
    await page.goto(BASE + '/leads/list');
    const ro = await page.getByText('Read-only for your role').count();
    check(u.name === 'atreyi' ? ro === 1 : ro === 0, `${u.name}: leads read-only badge = ${ro}`);
    // sign out
    await page.click('[data-testid=user-menu]');
    await page.click('[data-testid=sign-out]');
    await page.waitForURL('**/login**');
    await page.goto(BASE + '/dashboard');
    check(page.url().includes('/login'), `${u.name}: signed out, dashboard redirects to login`);
    await ctx.close();
  }
  // mobile screenshot
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/login');
    await page.screenshot({ path: `${DIR}/mobile-login.png` });
    await page.fill('#email', 'atreyi.demo@hk-refurbished-stock.com');
    await page.fill('#password', PW);
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard');
    await page.click('button[aria-label="Open menu"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/mobile-menu.png` });
    await ctx.close();
  }
  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
