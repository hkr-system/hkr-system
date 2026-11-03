// Overdue alerts for the dashboard (brief Phase 5 item 6, SOP P9 "escalate when"): deposit or balance overdue,
// orders ready to ship for more than 2 days, ETA passed, RMAs approved but not batched by Thursday, and RMAs waiting
// more than 2 days for the client's evidence. Pure and unit-tested.
import { daysBetween, isoWeekday } from "./dates";

export type AlertOrder = {
  id: string; account_code: string; number: string; status: string; since: string | null; order_date: string;
  deposit_payable: number; deposit_confirmed: number; balance_ok: boolean; payment_awaiting: boolean; eta_date: string | null;
};
export type AlertRma = {
  id: string; account_code: string; number: string; status: string; created_at: string;
  units_without_evidence: number; units_to_batch: number; intermediary_id: string | null;
};
export type Alert = { key: string; tone: "danger" | "warn"; kind: "deposit" | "balance" | "eta" | "proof" | "batch" | "evidence"; ref: string; text: string; href: string };

export const READY_ALERT_DAYS = 2;     // brief: "orders ready to ship for more than 2 days"
export const EVIDENCE_ALERT_DAYS = 2;  // SOP P9: "an RMA waiting more than two days for the client's evidence"

export function buildAlerts(input: {
  orders: AlertOrder[]; rmas: AlertRma[]; today: string; depositOverdueDays: number; cutoffDate: string;
}): Alert[] {
  const { today } = input;
  const out: Alert[] = [];
  for (const o of input.orders) {
    const ref = `${o.account_code} ${o.number}`;
    const href = `/orders/${o.id}`;
    const inStage = daysBetween(o.since ?? o.order_date, today) ?? 0;
    if (o.payment_awaiting) out.push({ key: `proof-${o.id}`, tone: "warn", kind: "proof", ref, text: "Payment proof to confirm", href });
    if (o.status === "invoiced" && o.deposit_payable > 0 && o.deposit_confirmed <= 0 && !o.payment_awaiting && inStage > input.depositOverdueDays)
      out.push({ key: `dep-${o.id}`, tone: "danger", kind: "deposit", ref, text: `Deposit overdue · invoiced ${inStage} days ago`, href });
    if (o.status === "ready_to_ship" && inStage > READY_ALERT_DAYS)
      out.push({ key: `bal-${o.id}`, tone: "danger", kind: "balance", ref,
        text: o.balance_ok || o.payment_awaiting ? `Ready to ship for ${inStage} days` : `Balance overdue · ready to ship for ${inStage} days`, href });
    if (["deposit_paid", "in_preparation"].includes(o.status) && o.eta_date && o.eta_date < today)
      out.push({ key: `eta-${o.id}`, tone: "warn", kind: "eta", ref, text: `ETA passed (${daysBetween(o.eta_date, today)} days) — ask Hong Kong for the new date`, href });
  }
  const weekday = isoWeekday(today);
  const batchDay = (weekday === 4 || weekday === 5) && today <= input.cutoffDate;
  for (const r of input.rmas) {
    const href = `/rmas/${r.id}`;
    if (batchDay && r.intermediary_id && r.units_to_batch > 0)
      out.push({ key: `batch-${r.id}`, tone: "danger", kind: "batch", ref: r.number,
        text: `${r.units_to_batch} approved unit${r.units_to_batch === 1 ? "" : "s"} not in Friday's batch yet`, href });
    const waiting = daysBetween(r.created_at, today) ?? 0;
    if (["requested", "form_received"].includes(r.status) && r.units_without_evidence > 0 && waiting > EVIDENCE_ALERT_DAYS)
      out.push({ key: `ev-${r.id}`, tone: "warn", kind: "evidence", ref: r.number,
        text: `Waiting ${waiting} days for the client's evidence (${r.units_without_evidence} unit${r.units_without_evidence === 1 ? "" : "s"}) — escalate to the SD`, href });
  }
  return out.sort((a, b) => (a.tone === b.tone ? a.ref.localeCompare(b.ref) : a.tone === "danger" ? -1 : 1));
}
