// Orders board (Gabriel, Nov 3 2026): every order left to right by status — the same idea as the RMA batch board.
// Each column: count and US$ value; each card: client + ORD-NN, units, value, days in the stage and what is missing.
// Open orders (every status before Closed) stay on the board until they are closed; CLOSED orders are shown per month
// (the month they were closed) so the board does not fill up (Gabriel, Nov 3 2026). Pure; unit-tested.
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from "./constants";

export type BoardOrder = {
  id: string; number: string; account_code: string; status: OrderStatus; total_usd: number; pieces: number;
  order_date: string; eta_date: string | null; since: string | null;      // since = when it entered this status (yyyy-mm-dd)
  payment_awaiting: boolean; deposit_payable: number; deposit_confirmed: number; balance_ok: boolean;
  imei_count: number; label_ok: boolean; tracking: string | null;
};
export type Tone = "warn" | "ok" | "muted" | "danger";
export type OrderCard = { id: string; title: string; units: number; value: number; days: number | null; daysText: string; notes: { tone: Tone; text: string }[] };
export type OrderColumn = { status: OrderStatus; n: number; label: string; cards: OrderCard[]; value: number; units: number; alerts: number };

const DAY = 86400_000;
const days = (from: string | null, today: string) =>
  from ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / DAY)) : null;
const short = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
/** "2026-11" → "November 2026". */
export const monthLabel = (ym: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
/** The last n months, newest first ("2026-11", "2026-10", …). */
export function lastMonths(today: string, n = 12) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return d.toISOString().slice(0, 7); });
}

/** What the order still needs at its step (brief §6, SOP P2–P4). */
export function orderNotes(o: BoardOrder, today: string): { tone: Tone; text: string }[] {
  const n: { tone: Tone; text: string }[] = [];
  const inStage = days(o.since, today) ?? 0;
  if (o.payment_awaiting) n.push({ tone: "warn", text: "Payment proof to confirm" });
  switch (o.status) {
    case "quoted": n.push({ tone: "muted", text: "Send the invoice" }); break;
    case "invoiced":
      if (o.deposit_payable > 0 && o.deposit_confirmed <= 0 && !o.payment_awaiting) n.push({ tone: inStage > 3 ? "danger" : "warn", text: "Deposit due" });
      if (o.deposit_payable <= 0) n.push({ tone: "muted", text: "Deposit kept by the intermediary" });
      break;
    case "deposit_paid":
    case "in_preparation":
      if (!o.eta_date) n.push({ tone: "warn", text: "ETA pending" });
      else if (o.eta_date < today) n.push({ tone: "danger", text: `ETA ${short(o.eta_date)} passed` });
      else n.push({ tone: "muted", text: `ETA ${short(o.eta_date)}` });
      break;
    case "ready_to_ship":
      if (!o.balance_ok && !o.payment_awaiting) n.push({ tone: inStage > 2 ? "danger" : "warn", text: inStage > 2 ? `Balance due · ready ${inStage} days` : "Balance due" });
      break;
    case "balance_paid":
      if (!o.imei_count) n.push({ tone: "warn", text: "IMEI file missing" });
      if (!o.label_ok) n.push({ tone: "warn", text: "Label / courier missing" });
      if (o.imei_count && o.label_ok) n.push({ tone: "ok", text: "Clear to ship — add the AWB" });
      break;
    case "shipped": n.push({ tone: "muted", text: o.tracking ? `AWB ${o.tracking}` : "No AWB" }); break;
    default: break;
  }
  return n;
}

export function buildOrderBoard(orders: BoardOrder[], today: string, closedMonth = today.slice(0, 7)): OrderColumn[] {
  return ORDER_STATUSES.map((status, i) => {
    const rows = orders
      .filter((o) => o.status === status)
      .filter((o) => status !== "closed" || (o.since ?? o.order_date).slice(0, 7) === closedMonth)
      // longest waiting first, so what is stuck is on top
      .sort((a, b) => (a.since ?? a.order_date).localeCompare(b.since ?? b.order_date));
    const cards = rows.map<OrderCard>((o) => {
      const d = days(o.since ?? o.order_date, today);
      return {
        id: o.id, title: `${o.account_code} ${o.number}`, units: o.pieces, value: Number(o.total_usd),
        days: d, daysText: d === null ? "" : d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`, notes: orderNotes(o, today),
      };
    });
    if (status === "closed") cards.reverse(); // newest first
    return {
      status, n: i + 1, label: ORDER_STATUS_LABEL[status], cards,
      value: Math.round(cards.reduce((s, c) => s + c.value, 0) * 100) / 100,
      units: cards.reduce((s, c) => s + c.units, 0),
      alerts: cards.filter((c) => c.notes.some((x) => x.tone === "danger" || x.tone === "warn")).length,
    };
  });
}
