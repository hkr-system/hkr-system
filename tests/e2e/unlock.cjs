// Browser tests written before the pencil lock and the order tabs (Nov 3 2026):
//  - existing records are read-only until ✏️ Edit (components/edit-lock.tsx) → every ✏️ Edit is clicked as it appears;
//  - the order page shows one tab at a time (components/orders/order-tabs.tsx) → every tab panel is kept visible.
// So the older tests keep testing what they tested. The lock and the tabs themselves are checked in edit-lock.cjs.
async function autoUnlock(context) {
  await context.addInitScript(() => {
    const run = () => {
      document.querySelectorAll('[data-testid=edit-unlock]').forEach((b) => b.click());
      document.querySelectorAll('[role=tabpanel][hidden]').forEach((p) => p.removeAttribute('hidden'));
    };
    new MutationObserver(run).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('DOMContentLoaded', run);
  });
}
module.exports = { autoUnlock };
