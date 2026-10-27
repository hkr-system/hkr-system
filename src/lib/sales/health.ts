// Account health (pure, unit-tested): why an account deserves attention today.

export type HealthInput = {
  status: "onboarding" | "active" | "paused" | "closed";
  lastOrderDate: string | null;
  openOrders: number;
  paymentToConfirm: number;
  balanceDueReady: number;     // Ready to ship with the balance not confirmed
  depositDue: number;          // Invoiced, no deposit yet
  etaPending: number;          // deposit paid / in preparation without ETA
  openRmas: number;            // Phase 4
};
export type Health = { level: "attention" | "watch" | "ok" | "inactive" | "new"; reasons: string[] };

export function accountHealth(i: HealthInput, today: string, inactiveDays: number): Health {
  const reasons: string[] = [];
  if (i.paymentToConfirm) reasons.push(`${i.paymentToConfirm} payment${i.paymentToConfirm > 1 ? "s" : ""} to confirm`);
  if (i.balanceDueReady) reasons.push(`balance due on ${i.balanceDueReady} order${i.balanceDueReady > 1 ? "s" : ""} ready to ship`);
  if (i.depositDue) reasons.push(`deposit due on ${i.depositDue} order${i.depositDue > 1 ? "s" : ""}`);
  if (i.etaPending) reasons.push("ETA pending");
  if (i.openRmas) reasons.push(`${i.openRmas} open RMA${i.openRmas > 1 ? "s" : ""}`);
  if (reasons.length) return { level: "attention", reasons };
  if (i.status === "onboarding") return { level: "new", reasons: ["onboarding"] };
  if (i.status === "active") {
    const days = i.lastOrderDate ? Math.floor((Date.parse(today) - Date.parse(i.lastOrderDate)) / 86400000) : null;
    if (days === null) return { level: "inactive", reasons: ["no order yet"] };
    if (days > inactiveDays) return { level: "inactive", reasons: [`no order for ${days} days`] };
  }
  if (i.openOrders) return { level: "watch", reasons: [`${i.openOrders} open order${i.openOrders > 1 ? "s" : ""}`] };
  return { level: "ok", reasons: [] };
}
