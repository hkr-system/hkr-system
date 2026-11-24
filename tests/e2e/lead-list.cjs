// Lead price list (Nov 24 2026, after `npm run db:reset`): admin sets the extra % behind the ✏️; the list = base × (1 + %),
// no client name; USD or EUR door to door via a company (its name never on the file); bd downloads without seeing the %;
// the specialist has no lead list. INVENTED door-to-door fees (public repo).
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PW = 'LocalDemo-2026!';
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
const login = async (page, email) => {
  await page.goto(BASE + '/login'); await page.fill('#email', email); await page.fill('#password', PW);
  await page.click('button[type=submit]'); await page.waitForURL('**/dashboard');
};
const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const eur = (n) => `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

(async () => {
  const { data: base } = await admin.from('price_lists').select('id').is('account_id', null).eq('brand', 'iphone').eq('status', 'approved').single();
  const { data: row } = await admin.from('price_list_rows').select('model, storage_gb, price_usd').eq('price_list_id', base.id).order('price_usd', { ascending: false }).limit(1).single();
  await admin.from('settings').update({ value: 0 }).eq('key', 'lead_list_extra_pct');
  const { data: co } = await admin.from('intermediaries').upsert({ name: 'Lead D2D Test Co', d2d: { enabled: true, brackets: [], fixed_eur: 5, ship_amount: 2, ship_currency: 'EUR', small_under: null, small_eur: 0, shipment_eur: 300, fx_spread: 0.01 } }, { onConflict: 'name' }).select('id').single();

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await login(p, 'gabriel.demo@hk-refurbished-stock.com');
  await p.goto(`${BASE}/price-lists`); await p.waitForSelector('[data-testid=lead-list-card]', { timeout: 60000 });
  check((await p.locator('[data-testid=lead-extra-pct]').innerText()).trim() === '0 %', 'admin: lead list starts at 0 %');
  const txt0 = await (await p.request.get(`${BASE}/api/price-lists/lead/iphone/txt`)).text();
  check(txt0.includes(usd(Number(row.price_usd))), 'at 0 %: lead price = base price');
  await p.locator('[data-testid=lead-extra-lock] [data-testid=edit-unlock]').click();
  await p.fill('input[aria-label="Lead extra margin %"]', '2');
  await p.click('[data-testid=lead-extra-save]');
  await p.waitForSelector('[data-testid=lead-extra-saved]', { timeout: 30000 });
  await p.reload(); await p.waitForSelector('[data-testid=lead-extra-pct]');
  check((await p.locator('[data-testid=lead-extra-pct]').innerText()).trim() === '2 %', 'admin: % saved behind the pencil');
  const exp = r2(Number(row.price_usd) * 1.02);
  const txt = await (await p.request.get(`${BASE}/api/price-lists/lead/iphone/txt`)).text();
  check(txt.includes(usd(exp)) && txt.startsWith('HK Refurbished Stock · Price list\n') && txt.includes('USD · FOB Hong Kong'), `USD: base × 1.02 (${usd(exp)}), no client name`);
  const xlsx = await p.request.get(`${BASE}/api/price-lists/lead/iphone/xlsx`);
  check(xlsx.ok() && /HKR_PL_\d{4}-\d{2}-\d{2}\.xlsx/.test(xlsx.headers()['content-disposition'] ?? ''), 'Excel download HKR_PL_<date>.xlsx');
  // EUR door to door: (price ÷ 1.10) + 5 € fixed + 2 € shipping
  const d = await (await p.request.get(`${BASE}/api/price-lists/lead/iphone/txt?mode=d2d&via=${co.id}&rate=1.1`)).text();
  check(d.includes(eur(r2(r2(exp / 1.1) + 7))) && !d.includes('Lead D2D Test Co') && d.includes('Customs clearance: +€300.00 per shipment'), 'EUR door to door: converted + fees, company name not on the file');
  const mode = p.locator('[data-testid=lead-list-iphone] select[aria-label="Prices in"]');
  check((await mode.locator('option').allInnerTexts()).some((t) => t.includes('Door to door via Lead D2D Test Co')), 'card: "Prices in" lists the companies with door to door');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.reload(); await p.waitForSelector('[data-testid=lead-list-card]');
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no horizontal page scroll');
  await p.close();

  const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await login(q, 'yessica.demo@hk-refurbished-stock.com');
  await q.goto(`${BASE}/price-lists`); await q.waitForSelector('[data-testid=lead-list-card]', { timeout: 60000 });
  check((await q.locator('[data-testid=lead-extra-pct]').count()) === 0 && (await q.locator('[data-testid=lead-extra-form]').count()) === 0 && (await q.locator('[data-testid=base-card]').count()) === 0,
    'bd: lead list card without the % and without the base card');
  check((await (await q.request.get(`${BASE}/api/price-lists/lead/iphone/txt`)).text()).includes(usd(exp)), 'bd: downloads the lead list with the admin\'s %');
  await q.close();

  const s = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await login(s, 'atreyi.demo@hk-refurbished-stock.com');
  await s.goto(`${BASE}/price-lists`); await s.waitForSelector('[data-testid=list-state-filter]', { timeout: 60000 });
  check((await s.locator('[data-testid=lead-list-card]').count()) === 0, 'specialist: no lead list card');
  check((await s.request.get(`${BASE}/api/price-lists/lead/iphone/txt`)).status() === 403, 'specialist: download refused');
  await s.close();
  await b.close();
  await admin.from('intermediaries').delete().eq('id', co.id);
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
