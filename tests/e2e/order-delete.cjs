// Delete an order (Nov 18 2026, after `npm run db:reset`): the specialist sees no delete card; an order with a confirmed payment
// shows why it cannot be deleted; the admin deletes a deletable order by typing its number → gone with its documents.
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

(async () => {
  const { data: ov } = await admin.from('order_overview').select('id, number, account_id, account_code, status, deposit_confirmed, balance_confirmed');
  const blocked = ov.find((o) => Number(o.deposit_confirmed) + Number(o.balance_confirmed) > 0);
  const { data: inv } = await admin.from('invoices').select('order_id, status');
  const free = ov.find((o) => Number(o.deposit_confirmed) + Number(o.balance_confirmed) === 0 && !inv.some((i) => i.order_id === o.id && ['approved', 'sent'].includes(i.status))
    && !['shipped', 'delivered', 'closed'].includes(o.status));
  check(blocked && free, `demo orders found (blocked ${blocked?.number}, deletable ${free?.number})`);
  // a document in the deletable order's folder
  const p = `${free.account_id}/orders/${free.number}/${free.account_code}_${free.number}_OTHER.txt`;
  await admin.storage.from('account-files').upload(p, Buffer.from('demo'), { contentType: 'text/plain', upsert: true });
  await admin.from('files').insert({ account_id: free.account_id, owner_table: 'orders', owner_id: free.id, kind: 'OTHER', storage_path: p, file_name: 'x.txt', mime_type: 'text/plain', size_bytes: 4 });

  const b = await chromium.launch();
  const sp = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await login(sp, 'atreyi.demo@hk-refurbished-stock.com');
  await sp.goto(`${BASE}/orders/${free.id}`); await sp.waitForSelector('[data-testid=lines-table]', { timeout: 60000 });
  check((await sp.locator('[data-testid=delete-order]').count()) === 0, 'specialist: no delete card');

  const ap = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await login(ap, 'gabriel.demo@hk-refurbished-stock.com');
  await ap.goto(`${BASE}/orders/${blocked.id}`); await ap.waitForSelector('[data-testid=delete-order]', { timeout: 60000 });
  check((await ap.locator('[data-testid=delete-blockers]').innerText()).includes('confirmed payment'), 'admin: an order with a confirmed payment says why it cannot be deleted');
  check((await ap.locator('[data-testid=delete-order-start]').count()) === 0, 'no delete button while blocked');

  await ap.goto(`${BASE}/orders/${free.id}`); await ap.waitForSelector('[data-testid=delete-order-start]', { timeout: 60000 });
  await ap.click('[data-testid=delete-order-start]');
  check(await ap.locator('[data-testid=delete-order-confirm]').isDisabled(), 'confirm stays off until the number is typed');
  await ap.fill('[aria-label="Type the order number"]', free.number.toLowerCase());
  await ap.click('[data-testid=delete-order-confirm]');
  await ap.waitForSelector('[data-testid=order-deleted]', { timeout: 60000 });
  check((await ap.locator('[data-testid=order-deleted]').innerText()).includes(free.number), 'back on the orders list with "was deleted"');
  const { data: gone } = await admin.from('orders').select('id').eq('id', free.id);
  const { data: files } = await admin.storage.from('account-files').list(`${free.account_id}/orders/${free.number}`);
  const { data: rows } = await admin.from('files').select('id').eq('owner_id', free.id);
  check(gone.length === 0 && rows.length === 0 && (files ?? []).filter((f) => f.id).length === 0, 'order, file rows and stored documents are gone');
  await b.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
