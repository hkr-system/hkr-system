// Order charges + mixed payments browser test (Nov 4 2026): units under the lines; shipping per unit, customs as one total,
// an extra charge and a discount; payment method Mixed (no USDT fee line); editing the order (route, shipping mode);
// a USDT payment that arrives without its fee → financial loss in the order's Finance tab.
// Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset` (it changes data).
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { autoUnlock } = require('./unlock.cjs');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '.screens');
fs.mkdirSync(DIR, { recursive: true });
const PW = 'LocalDemo-2026!';
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await autoUnlock(ctx);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/login');
  await page.fill('#email', 'gabriel.demo@hk-refurbished-stock.com');
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');

  const { data: ams } = await admin.from('accounts').select('id').eq('code', 'AMS-NL-901').single();
  await page.goto(BASE + '/orders/new');
  await page.waitForSelector('[data-testid=order-account]', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.selectOption('[data-testid=order-account]', ams.id);
  await page.selectOption('select[name=payment_method]', 'mixed');
  await page.fill('[data-testid=magic-reader] textarea', '40 iPhone 15 128 mixed\n7 Galaxy S24 128 mixed');
  await page.click('[data-testid=magic-read]');
  await page.waitForTimeout(300);
  // drop the empty first line left by the reader, if any
  check((await page.locator('[data-testid=units-summary]').innerText()).includes('Total: 47 units'), 'units under the lines: Total 47 units');
  check((await page.locator('[data-testid=units-summary]').innerText()).includes('iPhone 15 128GB: 40'), 'units per model');

  await page.check('[data-testid=freight-mode-unit]');
  await page.fill('[data-testid=freight-unit]', '3');
  await page.fill('[data-testid=customs-total]', '100');
  check((await page.locator('[data-testid=total-freight]').innerText()).includes('141.00'), 'shipping per unit: 47 × $3 = $141');
  await page.click('[data-testid=add-charge]');
  await page.locator('[data-testid=charge-row]').nth(0).locator('input[aria-label="Charge description"]').fill('Shipping not charged on ORD-01');
  await page.locator('[data-testid=charge-row]').nth(0).locator('input[aria-label="Charge amount"]').fill('80');
  await page.click('[data-testid=add-discount]');
  await page.locator('[data-testid=charge-row]').nth(1).locator('input[aria-label="Charge amount"]').fill('-150');
  check((await page.locator('[data-testid=total-charges]').innerText()).includes('-70.00'), 'other charges −70 (80 − 150)');
  check((await page.locator('[data-testid=order-totals]').innerText()).includes('Mixed: no USDT fee'), 'Mixed: no USDT fee on the invoice');
  await page.screenshot({ path: path.join(DIR, 'order-charges-form.png'), fullPage: true });
  await page.click('button:has-text("Create order")');
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const orderId = page.url().split('/').pop();
  const { data: o1 } = await admin.from('orders').select('pieces, freight_usd, customs_usd, charges_usd, usdt_fee_usd, total_usd, subtotal_usd').eq('id', orderId).single();
  check(o1.pieces === 47 && Number(o1.freight_usd) === 141 && Number(o1.customs_usd) === 100 && Number(o1.charges_usd) === -70 && Number(o1.usdt_fee_usd) === 0,
    `saved: 47 units, shipping 141, customs 100, charges −70, no USDT fee (${JSON.stringify(o1)})`);
  check(Math.abs(Number(o1.total_usd) - (Number(o1.subtotal_usd) + 141 + 100 - 70)) < 0.005, 'total = products + shipping + customs + charges');
  const summary = await page.locator('[data-testid=order-summary]').innerText();
  check(summary.includes('Shipping (47 × US$ 3.00)') && summary.includes('Shipping not charged on ORD-01') && summary.includes('Discount'), 'order page lists shipping per unit, the charge and the discount');

  // edit: shipping becomes one total, route via Global Connect (the update grant fix)
  await page.goto(BASE + `/orders/${orderId}/edit`);
  await page.waitForSelector('[data-testid=order-charges]', { timeout: 60000 });
  await page.waitForTimeout(800);
  check((await page.locator('[data-testid=charge-row]').count()) === 2, 'edit form keeps the 2 charges');
  check(await page.isChecked('[data-testid=freight-mode-unit]'), 'edit form keeps shipping per unit');
  await page.check('[data-testid=freight-mode-total]');
  await page.fill('[data-testid=freight-total]', '200');
  await page.selectOption('[data-testid=order-route]', { label: 'Via Global Connect (invoices the client in EUR)' });
  await page.click('button:has-text("Save order")');
  await page.waitForURL(new RegExp(`/orders/${orderId}$`), { timeout: 30000 });
  const { data: o2 } = await admin.from('orders').select('freight_mode, freight_usd, intermediary_id').eq('id', orderId).single();
  check(o2.freight_mode === 'total' && Number(o2.freight_usd) === 200 && o2.intermediary_id, 'edited: shipping one total of $200, route via Global Connect');

  // invoiced, then a USDT payment of US$5,000 arrives without its 0.85 %
  await admin.from('orders').update({ status: 'invoiced' }).eq('id', orderId);
  await page.goto(BASE + `/orders/${orderId}?tab=payments`);
  await page.waitForSelector('[data-testid=payment-form]', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.selectOption('[data-testid=payment-form] select[name=method]', 'usdt');
  await page.fill('[data-testid=usdt-covers] input[name=usdt_covers]', '5000');
  check((await page.locator('[data-testid=usdt-expected]').innerText()).includes('5,042.50'), 'expected in USDT: 5,042.50');
  await page.fill('[data-testid=payment-form] input[name=amount]', '5000');
  check((await page.locator('[data-testid=usdt-check]').innerText()).includes('42.50 will be a financial loss'), 'warns: the fee 42.50 will be a financial loss');
  await page.click('[data-testid=payment-form] button:has-text("Record payment")');
  await page.waitForSelector('[data-testid=usdt-split]', { timeout: 30000 });
  check((await page.locator('[data-testid=usdt-split]').innerText()).includes('fee not received US$ 42.50'), 'payment row: fee not received = financial loss');
  await page.click('[data-testid=confirm-payment]');
  await page.waitForTimeout(1500);
  await page.goto(BASE + `/orders/${orderId}?tab=finance`);
  await page.waitForSelector('[data-testid=finance]', { timeout: 60000 });
  check((await page.locator('[data-testid=financial-loss]').innerText()).includes('42.50'), 'Finance tab: financial loss 42.50 lowers the profit');
  await page.screenshot({ path: path.join(DIR, 'order-charges-finance.png'), fullPage: true });

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
