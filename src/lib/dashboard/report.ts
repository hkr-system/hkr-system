// Daily internal reports (SOP P9), in the exact format of the SOP, one line per item, every open item every day;
// an empty section says "none". Pure and unit-tested; the page, the copy buttons and the 18:00 HK email use the same text.
import { ddMmm, ordinal, usd } from "./dates";

export type ReportOrder = {
  id: string; account_code: string; number: string; status: string; pieces: number; eta_date: string | null;
  payable_total: number; deposit_confirmed: number; balance_confirmed: number; balance_ok: boolean;
  label_ok: boolean; delivery_setup: string;
  reminders: string[];                       // dates (yyyy-mm-dd) of balance reminders sent, any order
};
export type ReportRma = {
  id: string; account_name: string; account_code: string; number: string; status: string; units: number;
  units_without_evidence: number; batch: { cutoff_date: string; status: string } | null; closed_at: string | null;
  resolutions: { resolution: string; credit_usd: number }[];
};

// "stage (deposit received / in production / ready)" — SOP words for each order status
const ORDER_STAGE: Record<string, string> = {
  invoiced: "deposit pending", deposit_paid: "deposit received", in_preparation: "in production",
  ready_to_ship: "ready", balance_paid: "ready",
};
export const REPORT_OPEN = ["invoiced", "deposit_paid", "in_preparation", "ready_to_ship", "balance_paid"];
const READY = ["ready_to_ship", "balance_paid"];

export const balancePending = (o: Pick<ReportOrder, "payable_total" | "deposit_confirmed" | "balance_confirmed">) =>
  Math.max(0, Math.round((Number(o.payable_total) - Number(o.deposit_confirmed) - Number(o.balance_confirmed)) * 100) / 100);

const ref = (o: { account_code: string; number: string }) => `${o.account_code} ${o.number}`;
const byRef = (a: { account_code: string; number: string }, b: { account_code: string; number: string }) =>
  a.account_code.localeCompare(b.account_code) || a.number.localeCompare(b.number, undefined, { numeric: true });

export type ReportSection = { title: string; lines: string[] };

export function ordersReport(orders: ReportOrder[]): ReportSection[] {
  const rows = [...orders].sort(byRef);
  const open = rows.filter((o) => REPORT_OPEN.includes(o.status)).map((o) =>
    `${ref(o)} · ${o.pieces} pcs · ${ORDER_STAGE[o.status]} · ${o.eta_date ? `ETA ${ddMmm(o.eta_date)}` : "ETA pending"}`);
  const ready = rows.filter((o) => READY.includes(o.status)).map((o) => {
    const balance = o.balance_ok ? "balance received" : "balance pending";
    const label = o.delivery_setup === "client_label"
      ? (o.label_ok ? "labels received" : "labels pending")
      : (o.label_ok ? "booking confirmed" : "booking pending");
    return `${ref(o)} · ${o.pieces} pcs · ${balance} · ${label}`;
  });
  const balances = rows.filter((o) => o.status === "ready_to_ship" && !o.balance_ok).map((o) => {
    const r = [...o.reminders].sort();
    const reminded = r.length ? `reminded ${ddMmm(r[r.length - 1])} (${ordinal(r.length)})` : "not reminded yet";
    return `${ref(o)} · ${usd(balancePending(o))} · ${reminded}`;
  });
  return [
    { title: "Open orders", lines: open },
    { title: "Orders ready to ship", lines: ready },
    { title: "Pending balances", lines: balances },
  ];
}

/** SOP stage words for an RMA: awaiting evidence / with SD / return in transit / credit pending (+ awaiting return, received HK). */
export function rmaStage(r: Pick<ReportRma, "status" | "units_without_evidence" | "batch">) {
  if (["requested", "form_received"].includes(r.status) && r.units_without_evidence > 0) return "awaiting evidence";
  if (["requested", "form_received", "verified"].includes(r.status)) return "with SD";
  if (r.status === "credit_agreed") return "credit pending";
  if (r.status === "received_hk") return "received HK";
  if (r.batch && r.batch.status === "shipped") return "return in transit";
  if (r.batch && r.batch.status === "received") return "received HK";
  return "awaiting return";
}

const RESOLUTION_WORD: Record<string, string> = {
  return_hk: "returned to HK", repair_credit: "repair credit", credit_note: "credit note", replacement: "replacement",
  not_covered: "not covered", pending: "pending",
};
export function rmaResolution(rs: ReportRma["resolutions"]) {
  const counts = new Map<string, { n: number; credit: number }>();
  for (const r of rs) {
    const c = counts.get(r.resolution) ?? { n: 0, credit: 0 };
    c.n++; c.credit += Number(r.credit_usd) || 0; counts.set(r.resolution, c);
  }
  if (!counts.size) return "no units";
  return [...counts.entries()].map(([k, c]) =>
    `${c.n} ${RESOLUTION_WORD[k] ?? k}${c.credit > 0 ? ` ${usd(Math.round(c.credit * 100) / 100)}` : ""}`).join(", ");
}

const shortRma = (r: Pick<ReportRma, "number" | "account_code">) =>
  r.number.startsWith(`${r.account_code}-`) ? r.number.slice(r.account_code.length + 1) : r.number;

export function rmaReport(rmas: ReportRma[], today: string, timeZone = "Asia/Hong_Kong"): ReportSection[] {
  const sorted = [...rmas].sort((a, b) => a.account_name.localeCompare(b.account_name) || a.number.localeCompare(b.number, undefined, { numeric: true }));
  const open = sorted.filter((r) => r.status !== "closed").map((r) =>
    `${r.account_name} ${shortRma(r)}${r.batch ? ` (batch ${ddMmm(r.batch.cutoff_date)})` : ""} · ${r.units} pcs · ${rmaStage(r)}`);
  const local = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const closed = sorted.filter((r) => r.status === "closed" && r.closed_at && local(r.closed_at) === today).map((r) =>
    `${r.account_name} ${shortRma(r)} · ${rmaResolution(r.resolutions)}`);
  return [
    { title: "Open RMA's", lines: open },
    { title: "Closed today", lines: closed },
  ];
}

/** The copy-ready block: "Title:" then "- line" per item, "- none" when empty. */
export function reportText(sections: ReportSection[]) {
  return sections.map((s) => `${s.title}:\n${(s.lines.length ? s.lines : ["none"]).map((l) => `- ${l}`).join("\n")}`).join("\n");
}
