// Phase 3 browser test: accounts, new-account wizard, orders, payments, shipping checklist, roles.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
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

function tmpFile(name, content) {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, content);
  return p;
}

(async () => {
  const browser = await chromium.launch();

  // Atreyi (specialist): wizard, contact, order, payment recorded but not confirmable, no finance
  let newOrderUrl;
  {
    const { ctx, page } = await login(browser, 'atreyi');
    await page.goto(BASE + '/accounts/list');
    check((await page.locator('[data-testid=accounts-table] tbody tr').count()) === 4, 'specialist sees all 4 demo accounts');
    await page.goto(BASE + '/accounts/new');
    await page.fill('input[name=name]', 'Brick Phones');
    await page.selectOption('select[name=country]', 'NL');
    check((await page.inputValue('[data-testid=account-code]')) === 'BRI-NL-001', 'client code suggested BRI-NL-001 (demo 9xx codes do not count)');
    await page.selectOption('[data-testid=intermediary]', { label: 'Via Global Connect' });
    await page.fill('input[name=contact_name]', 'Bram de Boer');
    await page.fill('input[name=contact_phone]', '+31 6 1199 0099');
    await page.click('button:has-text("Create account")');
    await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
    check((await page.textContent('[data-testid=page-title]')).includes('BRI-NL-001'), 'account created and opened');
    await page.click('[data-testid=account-tabs] >> text=Contacts');
    check((await page.textContent('[data-testid=contacts-table]')).includes('+31611990099'), 'first contact saved with normalized phone');
    await page.screenshot({ path: `${DIR}/account.png`, fullPage: true });

    await page.click('text=New order');
    await page.waitForURL('**/orders/new?account=*');
    const line = page.locator('[data-testid=order-line]').first();
    await line.locator('select[aria-label=SKU]').selectOption({ label: 'iPhone 13 128GB Midnight' });
    await line.locator('input[aria-label=Quantity]').fill('150');
    await line.locator('input[aria-label="Unit price"]').fill('140');
    await line.locator('input[aria-label="Battery US$ per unit"]').fill('8');
    check((await page.textContent('[data-testid=total]')).includes('22,200.00'), 'live total = 150 × 140 + battery 150 × 8');
    check((await page.textContent('[data-testid=deposit]')).includes('2,220.00'), 'live deposit 10 %');
    check((await page.locator('input[aria-label="Base price"]').count()) === 0, 'specialist does not see base price inputs');
    await page.screenshot({ path: `${DIR}/order-form.png`, fullPage: true });
    await page.click('button:has-text("Create order")');
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
    newOrderUrl = page.url();
    check((await page.textContent('[data-testid=page-title]')).includes('BRI-NL-001 ORD-01'), 'order numbered ORD-01');
    check(!(await page.$('[data-testid=finance]')), 'specialist: no finance card');
    await page.click('[data-testid=advance]');
    await page.waitForFunction(() => document.querySelector('[data-testid=order-status]')?.textContent === 'Invoiced');
    check(true, 'marked Invoiced');
    await page.fill('[data-testid=payment-form] input[name=amount]', '2200');
    await page.selectOption('[data-testid=payment-form] select[name=difference_reason]', 'bank_charges');
    await page.click('[data-testid=payment-form] button:has-text("Record payment")');
    await page.waitForSelector('[data-testid=payment-row] >> text=Awaiting confirmation');
    check((await page.textContent('[data-testid=payments]')).includes('diff US$ -20.00'), 'difference vs deposit due shown (-20)');
    check((await page.locator('[data-testid=confirm-payment]').count()) === 0, 'specialist cannot confirm the payment');
    check((await page.textContent('[data-testid=order-status]')) === 'Invoiced', 'order stays Invoiced until an admin confirms');

    // shipping checklist on MEX ORD-01 (balance paid, IMEIs loaded, label missing)
    await page.goto(BASE + '/orders?status=balance_paid');
    await page.click('[data-testid=orders-table] >> text=ORD-01');
    await page.waitForSelector('[data-testid=shipping]');
    check((await page.textContent('[data-testid=clear-to-ship]')).includes('Not clear'), 'not clear to ship without the label');
    await page.fill('[data-testid=shipping-form] input[name=tracking]', 'DHL 123456');
    await page.click('[data-testid=shipping-form] button:has-text("Save shipping details")');
    await page.waitForSelector('[data-testid=shipping-form] >> text=Saved.');
    await page.click('[data-testid=advance]');
    await page.waitForSelector('[data-testid=status-error]');
    check((await page.textContent('[data-testid=status-error]')).includes('label'), 'Mark Shipped refused: label missing');
    const label = tmpFile('label.pdf', '%PDF-1.4 demo label');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=label-upload] button')]);
    await chooser.setFiles(label);
    await page.waitForSelector('[data-testid=label-upload] >> text=Saved as MEX-MX-903_ORD-01_LABEL.pdf');
    await page.waitForFunction(() => document.querySelector('[data-testid=clear-to-ship]')?.textContent?.includes('Clear to ship'));
    check(true, 'label uploaded with the SOP file name → Clear to ship');
    await page.click('[data-testid=advance]');
    await page.waitForFunction(() => document.querySelector('[data-testid=order-status]')?.textContent === 'Shipped');
    check(true, 'marked Shipped');
    await page.screenshot({ path: `${DIR}/order-shipped.png`, fullPage: true });

    // IMEI upload on AMS ORD-03 (ready to ship): one valid, one duplicate of the demo master, one bad
    await page.goto(BASE + '/orders?attention=balance');
    await page.click('[data-testid=orders-table] >> text=ORD-03');
    const imei = tmpFile('imei.csv', 'IMEI\n490154203237518\n350000000000014\n490154203237519\n');
    const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=imei-upload] button')]);
    await ch2.setFiles(imei);
    await page.waitForSelector('[data-testid=imei-result]');
    check((await page.textContent('[data-testid=imei-result]')).includes('1 IMEIs loaded'), 'IMEI file: 1 loaded');
    check((await page.textContent('[data-testid=shipping]')).includes('already in the master'), 'duplicate IMEI reported');
    check((await page.textContent('[data-testid=shipping]')).includes('invalid'), 'bad check digit reported');
    await ctx.close();
  }

  // Gabriel (admin): confirms payment → Deposit paid, sees finance, notification
  {
    const { ctx, page } = await login(browser, 'gabriel');
    await page.goto(newOrderUrl);
    await page.click('[data-testid=confirm-payment]');
    await page.waitForFunction(() => document.querySelector('[data-testid=order-status]')?.textContent === 'Deposit paid');
    check(true, 'admin confirmation moves the order to Deposit paid');
    check(!!(await page.$('[data-testid=finance]')), 'admin sees the finance card');
    await page.goto(BASE + '/orders?attention=confirm');
    check((await page.textContent('[data-testid=orders-table]')).includes('MIA-US-904'), 'payment-to-confirm filter shows the short deposit (SOP example)');
    await page.screenshot({ path: `${DIR}/orders.png`, fullPage: true });
    await ctx.close();
  }

  // Yessica (bd): only own accounts
  {
    const { ctx, page } = await login(browser, 'yessica');
    await page.goto(BASE + '/accounts/list');
    const t = await page.textContent('[data-testid=accounts-table]');
    check(t.includes('AMS-NL-901') && t.includes('MEX-MX-903') && !t.includes('BER-DE-902'), 'bd sees only the accounts she owns');
    await page.goto(BASE + '/orders?status=all');
    check(!(await page.textContent('[data-testid=orders-table]')).includes('BER-DE-902'), 'bd sees no orders of other accounts');
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
