// Browser test for Phase 1 (Leads). Needs the app on http://localhost:3000 against
// LOCAL Supabase freshly reset (npm run db:reset). Changes local data.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '.screens');
fs.mkdirSync(DIR, { recursive: true });
const PW = 'LocalDemo-2026!';

let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

async function login(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.fill('#email', `${name}.demo@hk-refurbished-stock.com`);
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return { ctx, page };
}

async function apply(browser, data) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/apply' + (data.lang === 'es' ? '?lang=es' : ''));
  await page.fill('input[name=company]', data.company);
  await page.fill('input[name=contact_name]', data.contact);
  await page.fill('input[name=email]', data.email);
  await page.fill('input[name=whatsapp]', data.phone);
  await page.selectOption('select[name=country]', data.country);
  await page.selectOption('select[name=business_type]', data.type);
  await page.check(`input[name=sells_iphones][value=${data.iphones}]`);
  await page.check(`input[name=sells_refurbished][value=${data.refurb}]`);
  await page.selectOption('select[name=volume_range]', data.volume);
  if (data.screenshot) await page.screenshot({ path: `${DIR}/${data.screenshot}`, fullPage: true });
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=apply-done], p[role=alert]');
  const ok = await page.$('[data-testid=apply-done]');
  await ctx.close();
  return !!ok;
}

(async () => {
  const browser = await chromium.launch();

  // 0. Gabriel sets NL as target country so a Tier A is possible.
  {
    const { ctx, page } = await login(browser, 'gabriel');
    await page.goto(BASE + '/settings');
    await page.fill('[data-testid=target-countries] textarea', 'Netherlands, DE');
    await page.click('[data-testid=target-countries] button[type=submit]');
    await page.waitForSelector('[data-testid=target-countries] [aria-label=Saved]');
    await page.reload();
    check((await page.inputValue('[data-testid=target-countries] textarea')) === 'NL, DE', 'settings: target countries saved as ISO codes');
    await page.screenshot({ path: `${DIR}/settings-leads.png`, fullPage: true });
    await ctx.close();
  }

  // 1. Public form: a Tier A buyer and a pawn shop.
  check(await apply(browser, { company: 'Tulip Phones BV', contact: 'Eva Jansen', email: 'eva@tulip-phones.test', phone: '06 22334455',
    country: 'NL', type: 'refurbished_reseller', iphones: 'yes', refurb: 'yes', volume: '400-999', screenshot: 'apply-form.png' }), 'apply: Tier A submission accepted');
  check(await apply(browser, { lang: 'es', company: 'Empeños Centro', contact: 'Luis Pérez', email: 'luis@empenos.test', phone: '+52 55 1234 5678',
    country: 'MX', type: 'pawn_shop', iphones: 'yes', refurb: 'no', volume: '100-399' }), 'apply (ES): pawn shop submission accepted');
  check(await apply(browser, { company: 'Tulip Phones BV', contact: 'Eva Jansen', email: 'EVA@tulip-phones.test', phone: '0622334455',
    country: 'NL', type: 'refurbished_reseller', iphones: 'yes', refurb: 'yes', volume: '1000+' }), 'apply: same buyer again (should merge)');

  // 2. Yessica works the leads.
  {
    const { ctx, page } = await login(browser, 'yessica');
    await page.goto(BASE + '/leads');
    const subs = await page.textContent('[data-testid=myday-submissions]');
    check(subs.includes('Tulip Phones BV') && subs.includes('Empeños Centro'), 'My day: both form submissions listed');
    check(subs.includes('existing lead'), 'My day: repeated submission shown as existing lead');
    await page.screenshot({ path: `${DIR}/myday-yessica.png`, fullPage: true });

    await page.goto(BASE + '/leads/list?q=Tulip');
    check((await page.locator('[data-testid=leads-table] tbody tr').count()) === 1, 'merge: only one Tulip lead exists');
    await page.click('text=Tulip Phones BV');
    await page.waitForSelector('[data-testid=timeline]');
    const header = await page.textContent('main');
    check(header.includes('Qualified'), 'Tier A form lead lands in Qualified');
    check(header.includes('Score 90'), 'Tier A score = 90 (country 30 + iPhones 25 + 400+ 25 + refurbished 10)');
    const tl = await page.textContent('[data-testid=timeline]');
    check(tl.includes('Form submitted (existing lead updated)'), 'timeline: second submission merged');

    // next action, contact log, stage change
    await page.fill('[data-testid=next-action-panel] input[name=next_action]', 'Send price list');
    const today = new Date().toISOString().slice(0, 10);
    await page.fill('[data-testid=next-action-panel] input[name=next_action_date]', today);
    await page.click('[data-testid=next-action-panel] button[type=submit]');
    await page.waitForSelector('[data-testid=next-action-panel] >> text=Saved.');
    await page.fill('textarea[name=body]', 'Called Eva, wants iPhone 13 and 14 list');
    await page.click('button:has-text("Log contact")>>nth=1');
    await page.waitForSelector('[data-testid=timeline] >> text=Called Eva');
    await page.selectOption('[data-testid=stage-panel] select[name=stage]', 'Lost');
    await page.click('[data-testid=stage-panel] button[type=submit]');
    // Lost needs a reason: the browser blocks the empty required field
    check(await page.$('[data-testid=stage-panel] input[name=lost_reason]'), 'Lost asks for a reason');
    await page.selectOption('[data-testid=stage-panel] select[name=stage]', 'Meeting');
    await page.click('[data-testid=stage-panel] button[type=submit]');
    await page.waitForSelector('[data-testid=timeline] >> text=Qualified → Meeting');
    check(true, 'stage change Qualified → Meeting logged on the timeline');
    await page.screenshot({ path: `${DIR}/lead-detail.png`, fullPage: true });

    // disqualified pawn shop
    await page.goto(BASE + '/leads/list?tier=dq&q=Empe');
    await page.click('text=Empeños Centro');
    await page.waitForSelector('[data-testid=disqualified]');
    check((await page.textContent('main')).includes('New'), 'pawn shop: kept, flagged disqualified, stage New');

    // board drag: Utrecht Refurb Store (New, unassigned) → Contacted
    await page.goto(BASE + '/leads/board');
    const card = page.locator('[data-testid="board-card-Utrecht Refurb Store"]');
    const target = page.locator('[data-testid="board-column-Contacted"]');
    const cb = await card.boundingBox(); const tb = await target.boundingBox();
    await page.mouse.move(cb.x + 20, cb.y + 30); await page.mouse.down();
    await page.mouse.move(cb.x + 40, cb.y + 40, { steps: 5 });
    await page.mouse.move(tb.x + tb.width / 2, tb.y + 60, { steps: 15 }); await page.mouse.up();
    await page.waitForTimeout(1500);
    check((await target.textContent()).includes('Utrecht Refurb Store'), 'board: drag New → Contacted');
    await page.screenshot({ path: `${DIR}/board.png`, fullPage: true });
    await page.goto(BASE + '/leads/list?q=Utrecht');
    check((await page.textContent('[data-testid=leads-table]')).includes('Contacted'), 'board move saved in the database');

    // import
    const csv = path.join(DIR, 'import-test.csv');
    fs.writeFileSync(csv, [
      'Company,Contact,E-mail,Phone,Country,City',
      'Gouda Gadgets,Piet Smit,piet@gouda.test,0612345678,Netherlands,Gouda',
      'Amstel Mobile Dup,Someone,demo01@example.com,,NL,Amsterdam',
      'Gouda Gadgets again,Piet Smit,piet@gouda.test,,NL,Gouda',
      ',No Company,nocompany@test.test,,NL,',
    ].join('\n'));
    await page.goto(BASE + '/leads/import');
    await page.setInputFiles('#file', csv);
    await page.fill('#source', 'Test import');
    await page.click('button:has-text("Preview")');
    await page.waitForSelector('[data-testid=import-preview]');
    const pv = await page.textContent('[data-testid=import-preview]');
    check(pv.includes('1 new') && pv.includes('1 already in the system') && pv.includes('1 repeated') && pv.includes('1 without company'),
      'import preview: 1 new, 1 merge, 1 duplicate, 1 invalid');
    await page.screenshot({ path: `${DIR}/import-preview.png`, fullPage: true });
    await page.click('button:has-text("Import 1 new")');
    await page.waitForSelector('[data-testid=import-result]');
    check((await page.textContent('[data-testid=import-result]')).includes('1 created, 1 existing'), 'import: 1 created, 1 merged');
    await page.goto(BASE + '/leads/list?q=Gouda');
    check((await page.locator('[data-testid=leads-table] tbody tr').count()) === 1, 'imported lead visible');
    await page.goto(BASE + '/leads/import');
    await page.click('button:has-text("Undo")');
    await page.click('[role=dialog] button:has-text("Undo import")');
    await page.waitForSelector('[data-testid=undo-result]');
    check((await page.textContent('[data-testid=undo-result]')).includes('removed 1, kept 0'), 'undo result shown');
    check(true, 'undo import removed the untouched lead');
    await ctx.close();
  }

  // 3. Arslan: next actions due today
  {
    const { ctx, page } = await login(browser, 'arslan');
    await page.goto(BASE + '/leads');
    const due = await page.textContent('[data-testid=myday-due]');
    check(due.includes('Madrid Móviles Renovados') && due.includes('Guadalajara iStore'), "Arslan's My day: due today and overdue actions");
    check(!due.includes('Berlin Second Life'), "Arslan's My day: not other people's leads");
    await page.screenshot({ path: `${DIR}/myday-arslan.png`, fullPage: true });
    await ctx.close();
  }

  // 4. Atreyi: read only
  {
    const { ctx, page } = await login(browser, 'atreyi');
    await page.goto(BASE + '/leads');
    check(page.url().endsWith('/leads/list'), 'account_specialist: /leads opens the list (no My day)');
    check((await page.getByText('Read-only for your role').count()) === 1, 'account_specialist: read-only badge');
    await page.click('text=Amstel Mobile BV');
    await page.waitForSelector('[data-testid=timeline]');
    check((await page.locator('input[name=company]').count()) === 0, 'account_specialist: no edit form on lead');
    await page.goto(BASE + '/leads/board');
    check(!!(await page.$('[data-testid=no-access]')), 'account_specialist: board shows No access');
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
