// Phase 2 browser test: WhatsApp inbox, realtime, notifications, broadcasts, sidebar, column resize,
// leads overview. Needs: app on :3000 against LOCAL Supabase right after `npm run db:reset`, and the
// webhook served locally (`npx supabase functions serve --env-file supabase/functions/.env`).
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const FN = process.env.WEBHOOK_URL || 'http://127.0.0.1:54321/functions/v1/whatsapp-webhook';
const APP_SECRET = process.env.META_APP_SECRET || 'local-test-app-secret';
const DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '.screens');
fs.mkdirSync(DIR, { recursive: true });
const PW = 'LocalDemo-2026!';

let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

async function login(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.fill('#email', `${name}.demo@hk-refurbished-stock.com`);
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return { ctx, page };
}

async function webhook(from, name, body, id) {
  const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { display_phone_number: '15551442195', phone_number_id: 'LOCAL-PNID' },
    contacts: [{ profile: { name }, wa_id: from }],
    messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } }] } }] }] });
  const sig = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');
  const res = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${sig}` }, body: payload });
  return res.status;
}

(async () => {
  const browser = await chromium.launch();

  // Gabriel: inbox, realtime, notification
  {
    const { ctx, page } = await login(browser, 'gabriel');
    await page.goto(BASE + '/whatsapp');
    const list = await page.textContent('[data-testid=conversation-list]');
    check(list.includes('CDMX Celulares') && list.includes('Amstel Mobile BV'), 'inbox lists demo conversations linked to leads');
    await page.click('[data-testid=conversation-list] >> text=Amstel Mobile BV');
    await page.waitForSelector('[data-testid=window-badge]');
    check((await page.textContent('[data-testid=window-badge]')).includes('open'), '24h window badge shows open for a recent inbound');
    check((await page.textContent('footer')).includes('Demo conversation'), 'demo number: replies disabled with explanation');
    await page.screenshot({ path: `${DIR}/inbox.png` });

    check((await webhook('50370009999', 'Realtime Rita', 'Hola, ¿precio del iPhone 15?', 'wamid.E2E1')) === 200, 'webhook accepted a signed message');
    await page.waitForSelector('[data-testid=conversation-list] >> text=Realtime Rita', { timeout: 15000 });
    check(true, 'new conversation appeared without reloading (realtime)');
    await page.waitForFunction(() => document.querySelector('[data-testid=bell]')?.getAttribute('aria-label')?.match(/\((\d+) unread/)?.[1] > 0, null, { timeout: 15000 });
    await page.click('[data-testid=bell]');
    check(!!(await page.waitForSelector('[role=menu] >> text=New WhatsApp from Realtime Rita', { timeout: 10000 }).catch(() => null)), 'bell shows the new WhatsApp message');
    await page.click('[role=menu] >> text=New WhatsApp from Realtime Rita');
    await page.waitForURL('**/whatsapp?c=*');
    await page.waitForSelector('[data-testid=conversation-title] >> text=Realtime Rita', { timeout: 15000 });
    check((await page.textContent('[data-testid=thread]')).includes('precio del iPhone 15'), 'notification opens the conversation');
    check((await page.textContent('[data-testid=window-badge]')).includes('open'), 'real number: window open after inbound');
    check((await page.textContent('footer')).includes('not connected yet'), 'without access token the composer explains WhatsApp is not connected');
    await page.screenshot({ path: `${DIR}/inbox-realtime.png` });

    // sidebar collapse persists
    await page.click('[data-testid=sidebar-toggle]');
    await page.waitForTimeout(300);
    await page.reload();
    const w = await page.$eval('[data-testid=sidebar]', (el) => el.getBoundingClientRect().width);
    check(w < 70, `sidebar stays collapsed after reload (${w}px)`);
    await page.screenshot({ path: `${DIR}/sidebar-collapsed.png` });
    await page.click('[data-testid=sidebar-toggle]');
    await page.waitForTimeout(300);
    const r = await page.$eval('[data-testid=sidebar-resizer]', (el) => { const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + 200 }; });
    await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x + 80, r.y, { steps: 8 }); await page.mouse.up();
    const w2 = await page.$eval('[data-testid=sidebar]', (el) => el.getBoundingClientRect().width);
    check(w2 > 280, `sidebar resized by dragging (${w2}px)`);
    await page.mouse.move(r.x + 80, r.y); await page.mouse.down(); await page.mouse.move(r.x, r.y, { steps: 8 }); await page.mouse.up();

    // column resize on the leads list persists
    await page.goto(BASE + '/leads/list');
    const th = page.locator('[data-testid=leads-table] th').nth(1);
    const before = (await th.boundingBox()).width;
    const h = await th.locator('[data-slot=column-resizer]').boundingBox();
    await page.mouse.move(h.x + 3, h.y + 10); await page.mouse.down(); await page.mouse.move(h.x + 123, h.y + 10, { steps: 10 }); await page.mouse.up();
    const after = (await th.boundingBox()).width;
    check(after > before + 100, `column widened by dragging (${Math.round(before)} → ${Math.round(after)})`);
    await page.reload();
    // widths are applied after hydration (the page now streams in), so allow it a moment
    let kept = 0;
    for (let i = 0; i < 30; i++) {
      kept = (await page.locator('[data-testid=leads-table] th').nth(1).boundingBox()).width;
      if (Math.abs(kept - after) < 4) break;
      await page.waitForTimeout(200);
    }
    check(Math.abs(kept - after) < 4, 'column width remembered after reload');

    // overview
    await page.goto(BASE + '/leads');
    check(!!(await page.$('[data-testid=funnel]')) && (await page.textContent('[data-testid=closest]')).includes('München ReCell'),
      'leads overview: funnel and closest-to-convert list');
    await page.screenshot({ path: `${DIR}/leads-overview.png`, fullPage: true });
    await ctx.close();
  }

  // Yessica: visibility, broadcast draft, Qualified notification
  {
    const { ctx, page } = await login(browser, 'yessica');
    await page.goto(BASE + '/whatsapp?view=all');
    const list = await page.textContent('[data-testid=conversation-list]');
    check(!list.includes('Berlin Second Life'), 'bd does not see a chat assigned to Gabriel');
    check(list.includes('Realtime Rita'), 'bd sees unassigned chats');

    await page.goto(BASE + '/whatsapp/broadcasts/new');
    await page.fill('input[name=name]', 'E2E utility test');
    await page.check('input[name=markets][value=EU]');
    await page.click('button:has-text("Count recipients")');
    await page.waitForSelector('[data-testid=audience]');
    check((await page.textContent('[data-testid=audience]')).match(/^\d+ will receive/), 'audience counted');
    await page.waitForSelector('[data-testid=cost-total]');
    const formCost = await page.textContent('[data-testid=cost-total]');
    check(/US\$\d/.test(formCost) && (await page.textContent('[data-testid=cost-estimate]')).includes('Netherlands'),
      `estimated cost shown before saving (${formCost.trim()})`);
    await page.screenshot({ path: `${DIR}/broadcast-cost.png`, fullPage: true });
    await page.click('button:has-text("Save draft")');
    await page.waitForURL('**/whatsapp/broadcasts/*');
    check((await page.textContent('[data-testid=cost-total]')) === formCost, 'same estimated cost on the broadcast page');
    const actions = await page.textContent('[data-testid=broadcast-actions]');
    check(actions.includes('Submit for approval') && !actions.includes('Approve'), 'bd can submit but not approve');
    await page.click('button:has-text("Submit for approval")');
    await page.waitForFunction(() => document.querySelector('[data-testid=broadcast-status]')?.textContent?.includes('Waiting'));
    check(true, 'broadcast waiting for admin');
    const bcUrl = page.url();
    await page.screenshot({ path: `${DIR}/broadcast.png`, fullPage: true });

    await page.goto(BASE + '/leads/list?q=Rotterdam');
    await page.click('text=Rotterdam Phone Hub');
    await page.selectOption('[data-testid=stage-panel] select[name=stage]', 'Qualified');
    await page.click('[data-testid=stage-panel] button[type=submit]');
    await page.waitForSelector('[data-testid=timeline] >> text=Contacted → Qualified');
    await page.reload();
    await page.click('[data-testid=bell]');
    check((await page.textContent('[role=menu]')).includes('Lead qualified: Rotterdam Phone Hub'), 'owner notified when a lead becomes Qualified');
    await ctx.close();

    const g = await login(browser, 'gabriel');
    await g.page.goto(bcUrl);
    await g.page.click('button:has-text("Approve and send")');
    await g.page.waitForFunction(() => document.querySelector('[data-testid=broadcast-status]')?.textContent?.includes('Approved'));
    check(true, 'admin approved the broadcast');
    await g.ctx.close();
  }

  // Atreyi: no broadcasts
  {
    const { ctx, page } = await login(browser, 'atreyi');
    await page.goto(BASE + '/whatsapp');
    check((await page.getByRole('link', { name: 'Broadcasts' }).count()) === 0, 'specialist has no Broadcasts tab');
    await page.goto(BASE + '/whatsapp/broadcasts');
    check(!!(await page.$('[data-testid=no-access]')), 'specialist: broadcasts page shows No access');
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
