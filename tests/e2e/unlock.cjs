// Browser tests that type into existing records: the app shows them read-only until ✏️ Edit (components/edit-lock.tsx).
// autoUnlock(context) clicks every ✏️ Edit as soon as it appears, so the older tests keep testing what they tested.
// The lock itself is checked in tests/e2e/edit-lock.cjs.
async function autoUnlock(context) {
  await context.addInitScript(() => {
    const click = () => document.querySelectorAll('[data-testid=edit-unlock]').forEach((b) => b.click());
    new MutationObserver(click).observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', click);
  });
}
module.exports = { autoUnlock };
