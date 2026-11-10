// Import an invoice made in Excel (Nov 9 2026). Builds an INVENTED invoice in HKR's layout, then: the specialist imports it
// as Invoiced (route Global Connect found from the consignee, total check, the Excel saved as INV-HK); the admin imports it
// as "Closed — already paid" (confirmed payment); a wrong Excel total keeps Create order off. Run after `npm run db:reset`.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
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
const login = async (page, email) => {
  await page.goto(BASE + '/login'); await page.fill('#email', email); await page.fill('#password', PW);
  await page.click('button[type=submit]'); await page.waitForURL('**/dashboard');
};

async function makeInvoice(file, number, totalCell) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Invoice');
  const put = (a, v) => { ws.getCell(a).value = v; };
  put('B1', 'COMMERCIAL INVOICE'); put('V5', `Invoice No: ${number}`);
  put('B7', 'Exporter Name and Address:'); put('L7', 'Ultimate Consignee Name and Address:'); put('T7', 'Ship To Name and Address:');
  ['Global Connect B.V.', 'Demo street 34', '3237 MK Demo', 'Netherlands'].forEach((v, i) => put(`L${8 + i}`, v));
  ['Demo Logistics / CO Global Connect', 'Demo road 4C', '3045 AK ROTTERDAM', 'The Netherlands'].forEach((v, i) => put(`T${8 + i}`, v));
  put('L12', 'Notify Party Name and Address:'); put('T12', new Date(Date.UTC(2026, 10, 2)));
  put('L13', 'Contact:'); put('N13', 'Demo Person'); put('L14', 'email:'); put('N14', 'ops@example.com'); put('L16', 'Phone:'); put('N16', '+31 6 0000');
  put('L17', 'Transportation:');
  put('B20', 'Line #'); put('D20', 'Harmonized Number, Product Description'); put('S20', 'Quantity'); put('V20', 'U. Price'); put('Y20', 'Total Price');
  put('B24', 1); put('D24', 'iPhone 15 / 128 GB / Physical SIM + eSIM / CE Marked / 80%+ BH / A+++ / Colors: Black(10), Blue(10)'); put('S24', 20); put('V24', 400); put('Y24', { formula: 'V24*S24', result: 8000 });
  put('B25', 2); put('D25', 'iPhone 14 Pro / 256 GB / New Battery cell 0 Cycle / CE Marked / A+++ / Mixed'); put('S25', 10); put('V25', 460); put('Y25', { formula: 'V25*S25' });
  put('D26', 'New battery cell'); put('S26', 10); put('V26', 10); put('Y26', { formula: 'V26*S26', result: 100 });
  put('D27', 'Shipping HK to Netherlands'); put('S27', 30); put('V27', 3); put('Y27', { formula: 'V27*S27', result: 90 });
  put('D28', "RMA's Credit note"); put('Y28', -50);
  put('D30', 'Account: Demo Bank 000');
  put('B33', 'Total C.F.R.: USD'); put('Y33', { formula: 'SUM(Y24:AA32)', result: totalCell });
  put('O41', 'Date of Order:'); put('O42', new Date(Date.UTC(2026, 9, 30)));
  await wb.xlsx.writeFile(file);
}

async function importAs(page, file, status) {
  const { data: acc } = await admin.from('accounts').select('id').eq('code', 'AMS-NL-901').single();
  await page.goto(BASE + '/orders/import');
  await page.waitForSelector('[data-testid=import-account]', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.selectOption('[data-testid=import-account]', acc.id);
  await page.setInputFiles('[data-testid=import-file]', file);
  await page.click('[data-testid=import-read]');
  await page.waitForSelector('[data-testid=import-card]', { timeout: 30000 });
  await page.waitForTimeout(500);
  if (status) await page.selectOption('[data-testid=import-status]', status);
  return acc.id;
}

(async () => {
  const tmp = path.join(DIR, 'import-demo.xlsx'), bad = path.join(DIR, 'import-demo-bad.xlsx');
  await makeInvoice(tmp, '11022026', 12740);
  await makeInvoice(bad, '11022026-2', 12000);
  const browser = await chromium.launch();

  // specialist: Invoiced, no "already paid"
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await login(page, 'atreyi.demo@hk-refurbished-stock.com');
  await importAs(page, tmp);
  const check1 = await page.locator('[data-testid=import-total-check]').innerText();
  check(check1.includes('same total'), `total check: ${check1}`);
  check((await page.locator('[data-testid=import-status] option[value=closed_paid]').count()) === 0, 'specialist: no "Closed — already paid"');
  const route = await page.$eval('[data-testid=order-route]', (s) => s.options[s.selectedIndex].text);
  check(route.includes('Global Connect'), `route from the Ultimate consignee: ${route}`);
  check((await page.locator('[data-testid=order-line]').count()) === 2, 'two product lines');
  check((await page.locator('[data-testid=new-address] input[name=new_address_label]').inputValue()) === 'Demo Logistics / CO Global Connect', 'ship to → "+ New address" filled from the Excel');
  await page.screenshot({ path: path.join(DIR, 'invoice-import.png'), fullPage: true });
  await page.click('button:has-text("Create order")');
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const id1 = page.url().split('/').pop();
  const { data: o1 } = await admin.from('orders').select('status, total_usd, hk_invoice_no, order_date, payment_method, intermediaries(name)').eq('id', id1).single();
  check(o1.status === 'invoiced' && Number(o1.total_usd) === 12740 && o1.hk_invoice_no === '11022026' && o1.intermediaries?.name === 'Global Connect' && o1.order_date === '2026-10-30',
    `order: ${JSON.stringify(o1)}`);
  const { data: f1 } = await admin.from('files').select('kind, file_name').eq('owner_id', id1);
  check(f1.some((f) => f.kind === 'INV-HK' && f.file_name.endsWith('_INV-HK.xlsx')), `the Excel saved as INV-HK (${f1.map((f) => f.file_name).join(', ')})`);
  await ctx.close();

  // admin: "Closed — already paid" + a confirmed payment; a wrong total keeps Create order off
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p2 = await ctx2.newPage();
  await login(p2, 'gabriel.demo@hk-refurbished-stock.com');
  await importAs(p2, bad);
  check((await p2.locator('[data-testid=import-total-check]').innerText()).includes('difference'), 'wrong Excel total → red difference');
  check(await p2.locator('button:has-text("Create order")').isDisabled(), 'wrong Excel total → Create order is off');
  await importAs(p2, tmp, 'closed_paid');
  await p2.click('button:has-text("Create order")');
  await p2.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const id2 = p2.url().split('/').pop();
  const { data: o2 } = await admin.from('orders').select('status, total_usd').eq('id', id2).single();
  const { data: pays } = await admin.from('payments').select('amount, status').eq('order_id', id2);
  check(o2.status === 'closed' && pays.length === 1 && pays[0].status === 'confirmed' && Number(pays[0].amount) === 12740, `closed + paid: ${JSON.stringify({ o2, pays })}`);
  const { data: ov } = await admin.from('order_overview').select('*').eq('id', id2).single();
  const due = Number(ov.payable_total) - Number(ov.deposit_confirmed) - Number(ov.balance_confirmed);
  check(due === 0 && ov.balance_ok, `nothing left to collect (${due})`);

  // phone width: the first step fits
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  await login(p3, 'atreyi.demo@hk-refurbished-stock.com');
  await p3.goto(BASE + '/orders/import');
  await p3.waitForSelector('[data-testid=import-start]', { timeout: 60000 });
  check(await p3.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone width: no page-level horizontal scroll');

  await browser.close();
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
