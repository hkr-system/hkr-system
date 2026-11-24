// WhatsApp → Offers (Nov 24 2026, after `npm run db:reset`): Special Volume Deal from the current base (no margin), the 3
// biggest US$ drops vs the previous base ticked; Europe in EUR door to door via a route, US / LATAM base + US$ per unit;
// quantities and battery price typed; copy. Admin + bd; the specialist has no WhatsApp. INVENTED fees and prices.
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
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n, s) => { const r = r2(n); return Number.isInteger(r) ? `${s}${r.toLocaleString('en-US')}` : `${s}${r.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };

(async () => {
  const { data: base } = await admin.from('price_lists').select('id').is('account_id', null).eq('brand', 'iphone').eq('status', 'approved').single();
  const { data: old } = await admin.from('price_list_rows').select('model, storage_gb, note, price_usd, sort_order').eq('price_list_id', base.id).order('sort_order');
  // new base: three drops of 30 / 20 / 10, one of 2, one rise
  const drops = { 0: 10, 1: 30, 2: 2, 3: 20, 4: -5 };
  const { data: nb } = await admin.from('price_lists').insert({ account_id: null, brand: 'iphone', valid_from: new Date().toISOString().slice(0, 10) }).select('id').single();
  const rows = old.map((r, i) => ({ price_list_id: nb.id, model: r.model, storage_gb: r.storage_gb, note: r.note, sort_order: i, price_usd: r2(Number(r.price_usd) - (drops[i] ?? 0)) }));
  await admin.from('price_list_rows').insert(rows);
  await admin.from('price_lists').update({ status: 'approved' }).eq('id', nb.id);
  const top = [1, 3, 0].map((i) => rows[i]);
  await admin.from('intermediaries').upsert({ name: 'Offer Route Test', d2d: { enabled: true, brackets: [], fixed_eur: 5, ship_amount: 2, ship_currency: 'EUR', small_under: null, small_eur: 0, shipment_eur: 0, fx_spread: 0 } }, { onConflict: 'name' });

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  await login(p, 'gabriel.demo@hk-refurbished-stock.com');
  await p.goto(`${BASE}/whatsapp/offers`); await p.waitForSelector('[data-testid=offer-builder]', { timeout: 60000 });
  check((await p.locator('a:has-text("Offers")').count()) > 0, 'WhatsApp tabs: Offers');
  const ticked = await p.locator('[data-testid=offer-row]:has(input[type=checkbox]:checked) td:nth-child(2)').allInnerTexts();
  check(JSON.stringify(ticked) === JSON.stringify(top.map((r) => `${r.model} ${r.storage_gb}GB`)), `the 3 biggest US$ drops are ticked, biggest first (${ticked.join(', ')})`);
  await p.locator('select[aria-label=Route]').selectOption({ label: 'Offer Route Test' });
  await p.fill('input[aria-label="EUR to USD rate"]', '1.1');
  await p.fill('input[aria-label="New battery EUR"]', '8.6');
  await p.fill(`input[aria-label="Quantity ${top[0].model} ${top[0].storage_gb}GB"]`, '1000');
  await p.waitForFunction((s) => document.querySelector('[data-testid=offer-text]')?.value.includes(s), `— 1000 pcs @ *€`, { timeout: 30000 });
  const eu = await p.locator('[data-testid=offer-text]').inputValue();
  const e0 = money(r2(top[0].price_usd / 1.1) + 7, '€');
  check(eu.startsWith('*HK Refurbished Stock — Special Volume Deal 🇪🇺*') && eu.includes('— +€8.6/unit') && eu.includes(`▪️ ${top[0].model} ${top[0].storage_gb}GB — 1000 pcs @ *${e0}*`),
    `Europe: header, battery, ${top[0].model} ${top[0].storage_gb}GB 1000 pcs @ ${e0} (EUR door to door)`);
  check(!eu.includes('Offer Route Test') && !eu.includes('youtube'), 'Europe: no company name, no videos');
  // US / LATAM
  await p.locator('select[aria-label=Market]').selectOption('us');
  await p.fill('input[aria-label="US door to door per unit"]', '12');
  await p.fill('input[aria-label="New battery USD"]', '10');
  await p.waitForFunction(() => document.querySelector('[data-testid=offer-text]')?.value.includes('US door-to-door'), null, { timeout: 30000 });
  const us = await p.locator('[data-testid=offer-text]').inputValue();
  check(us.includes(`▪️ ${top[1].model} ${top[1].storage_gb}GB @ *${money(top[1].price_usd + 12, '$')}*`) && us.includes('— +$10/unit') && us.includes('CBM Brazil 2025'),
    `US / LATAM: base + $12 (${money(top[1].price_usd + 12, '$')}), battery $10, videos`);
  // touch-up kept until something changes, then copy
  await p.locator('[data-testid=offer-text]').fill(us + '\nExtra line');
  check((await p.locator('[data-testid=offer-text]').inputValue()).endsWith('Extra line'), 'the message can be touched up before copying');
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.click('[data-testid=offer-copy]');
  check((await p.evaluate(() => navigator.clipboard.readText())).endsWith('Extra line'), 'Copy message puts the text on the clipboard');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.reload(); await p.waitForSelector('[data-testid=offer-builder]');
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no horizontal page scroll');
  await p.waitForFunction(() => document.querySelector('input[aria-label="New battery EUR"]')?.value === '8.6', null, { timeout: 10000 }).catch(() => {});
  check((await p.locator('input[aria-label="New battery EUR"]').inputValue()) === '8.6', 'battery price remembered in this browser');
  await p.close();

  const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await login(q, 'yessica.demo@hk-refurbished-stock.com');
  await q.goto(`${BASE}/whatsapp/offers`); await q.waitForSelector('[data-testid=offer-builder]', { timeout: 60000 });
  check((await q.locator('[data-testid=offer-row]').count()) === rows.length, 'bd: builds offers from the base');
  await q.close();
  const s = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await login(s, 'atreyi.demo@hk-refurbished-stock.com');
  await s.goto(`${BASE}/whatsapp/offers`); await s.waitForTimeout(3000);
  check((await s.locator('[data-testid=offer-builder]').count()) === 0, 'specialist: no access');
  await s.close();
  await b.close();
  await admin.from('intermediaries').delete().eq('name', 'Offer Route Test');
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
