import { describe, expect, it } from "vitest";
import { ddMmm, ordinal, weekStart } from "./dates";
import { ordersReport, reportText, rmaReport, rmaStage, type ReportOrder, type ReportRma } from "./report";
import { rmaAskDraft, thursdayDraft, type UpdateOrder } from "./updates";
import { buildAlerts, type AlertOrder } from "./alerts";
import { escalationText } from "./escalations";

const order = (o: Partial<ReportOrder>): ReportOrder => ({
  id: "o", account_code: "AMS-NL-901", number: "ORD-01", status: "in_preparation", pieces: 100, eta_date: null,
  payable_total: 20000, deposit_confirmed: 2000, balance_confirmed: 0, balance_ok: false, label_ok: false,
  delivery_setup: "client_label", reminders: [], ...o,
});

describe("dates", () => {
  it("week starts on Monday", () => {
    expect(weekStart("2026-11-05")).toBe("2026-11-02"); // Thursday
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sunday
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
  });
  it("SOP date format and ordinals", () => {
    expect(ddMmm("2026-11-05")).toBe("05-Nov");
    expect([1, 2, 3, 4, 11, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "22nd"]);
  });
});

describe("daily report (SOP P9)", () => {
  it("prints the exact SOP format with 'none' for empty sections", () => {
    const text = reportText(ordersReport([
      order({ number: "ORD-02", status: "ready_to_ship", pieces: 50, reminders: ["2026-11-02", "2026-11-03"] }),
      order({ number: "ORD-01", eta_date: "2026-11-12" }),
    ]));
    expect(text).toBe([
      "Open orders:",
      "- AMS-NL-901 ORD-01 · 100 pcs · in production · ETA 12-Nov",
      "- AMS-NL-901 ORD-02 · 50 pcs · ready · ETA pending",
      "Orders ready to ship:",
      "- AMS-NL-901 ORD-02 · 50 pcs · balance pending · labels pending",
      "Pending balances:",
      "- AMS-NL-901 ORD-02 · USD 18,000.00 · reminded 03-Nov (2nd)",
    ].join("\n"));
    expect(reportText(ordersReport([]))).toBe("Open orders:\n- none\nOrders ready to ship:\n- none\nPending balances:\n- none");
  });
  it("courier bookings and received balances", () => {
    const [, ready] = ordersReport([order({ status: "balance_paid", balance_ok: true, delivery_setup: "courier", label_ok: false })]);
    expect(ready.lines[0]).toBe("AMS-NL-901 ORD-01 · 100 pcs · balance received · booking pending");
  });
  const rma = (r: Partial<ReportRma>): ReportRma => ({
    id: "r", account_name: "Demo Amsterdam", account_code: "AMS-NL-901", number: "AMS-NL-901-RMA-02", status: "requested",
    units: 3, units_without_evidence: 0, batch: null, closed_at: null, resolutions: [], ...r,
  });
  it("RMA stages in SOP words", () => {
    expect(rmaStage(rma({ units_without_evidence: 2 }))).toBe("awaiting evidence");
    expect(rmaStage(rma({ status: "verified" }))).toBe("with SD");
    expect(rmaStage(rma({ status: "credit_agreed" }))).toBe("credit pending");
    expect(rmaStage(rma({ status: "in_batch", batch: { cutoff_date: "2026-11-06", status: "shipped" } }))).toBe("return in transit");
    expect(rmaStage(rma({ status: "awaiting_return" }))).toBe("awaiting return");
  });
  it("RMA report with batch and closed today (HK date)", () => {
    const text = reportText(rmaReport([
      rma({ status: "in_batch", batch: { cutoff_date: "2026-11-06", status: "open" } }),
      rma({ number: "AMS-NL-901-RMA-01", status: "closed", closed_at: "2026-11-03T09:00:00Z",
        resolutions: [{ resolution: "credit_note", credit_usd: 120 }, { resolution: "credit_note", credit_usd: 80 }, { resolution: "not_covered", credit_usd: 0 }] }),
      rma({ number: "AMS-NL-901-RMA-00", status: "closed", closed_at: "2026-10-01T09:00:00Z" }),
    ], "2026-11-03"));
    expect(text).toBe([
      "Open RMA's:",
      "- Demo Amsterdam RMA-02 (batch 06-Nov) · 3 pcs · awaiting return",
      "Closed today:",
      "- Demo Amsterdam RMA-01 · 2 credit note USD 200.00, 1 not covered",
    ].join("\n"));
  });
});

const uo = (o: Partial<UpdateOrder>): UpdateOrder => ({
  number: "ORD-01", status: "in_preparation", eta_date: null, tracking: null, hk_invoice_no: null, deposit_payable: 2000,
  deposit_confirmed: 2000, balance_confirmed: 0, payable_total: 20000, balance_ok: false, label_ok: false,
  delivery_setup: "client_label", payment_awaiting: false, ...o,
});

describe("Thursday 3-line update (SOP §3.3)", () => {
  it("everything in order (EN)", () => {
    const t = thursdayDraft({ lang: "en", today: "2026-11-05", rmas: [], orders: [uo({ eta_date: "2026-11-12" })] });
    expect(t.split("\n")).toEqual([
      "Weekly update · 5 Nov",
      "1. Status: ORD-01 in production, ready date 12 Nov (as given by Hong Kong).",
      "2. Next: ORD-01 — next news on 12 Nov, the ready date given by Hong Kong.",
      "3. Everything is in order with your units.",
    ]);
  });
  it("asks for the balance with its invoice reference (ES)", () => {
    const t = thursdayDraft({ lang: "es", today: "2026-11-05", rmas: [], orders: [uo({ status: "ready_to_ship", hk_invoice_no: "AMS-NL-901-INV-01" })] });
    expect(t).toContain("1. Estado: ORD-01 lista para enviar.");
    expect(t).toContain("3. Lo que necesitamos de ustedes: el saldo de USD 18,000.00 de la ORD-01 (factura AMS-NL-901-INV-01).");
  });
  it("RMA waiting for evidence + shipped order with AWB", () => {
    const t = thursdayDraft({ lang: "en", today: "2026-11-05", orders: [uo({ status: "shipped", tracking: "123456" })],
      rmas: [{ number: "AMS-NL-901-RMA-02", account_code: "AMS-NL-901", status: "requested", units: 2, units_without_evidence: 2, batch: null }] });
    expect(t).toContain("ORD-01 shipped, AWB 123456; RMA-02 (2 pcs) waiting for your evidence.");
    expect(t).toContain("3. What we need from you: a photo or short video of each unit (fault + IMEI) for RMA-02.");
  });
  it("no ask while a payment proof is with us", () => {
    const t = thursdayDraft({ lang: "en", today: "2026-11-05", rmas: [], orders: [uo({ status: "invoiced", deposit_confirmed: 0, payment_awaiting: true })] });
    expect(t).toContain("3. Everything is in order with your units.");
  });
  it("RMA ask draft names the intermediary and the Friday cut-off", () => {
    expect(rmaAskDraft({ lang: "en", intermediary: "Global Connect", cutoffDate: "2026-11-06" })).toContain("through Global Connect closes on Friday 6 Nov at 12:00");
    expect(rmaAskDraft({ lang: "es", intermediary: "ASR", cutoffDate: "2026-11-06" })).toContain("cierra el viernes 6 nov a las 12:00");
  });
});

describe("alerts", () => {
  const ao = (o: Partial<AlertOrder>): AlertOrder => ({
    id: "o", account_code: "AMS-NL-901", number: "ORD-01", status: "invoiced", since: "2026-10-30", order_date: "2026-10-30",
    deposit_payable: 2000, deposit_confirmed: 0, balance_ok: false, payment_awaiting: false, eta_date: null, ...o,
  });
  const base = { rmas: [], today: "2026-11-03", cutoffDate: "2026-11-06" };
  it("a deposit is never overdue, even after 20+ days (Gabriel)", () => {
    expect(buildAlerts({ ...base, orders: [ao({ since: "2026-10-01" })] })).toEqual([]);
  });
  it("ready to ship more than 2 days; ETA passed", () => {
    const a = buildAlerts({ ...base, orders: [ao({ status: "ready_to_ship", since: "2026-10-31" }), ao({ id: "p", status: "in_preparation", eta_date: "2026-11-01" })] });
    expect(a.map((x) => x.text)).toEqual(["Balance overdue · ready to ship for 3 days", "ETA passed (2 days) — ask Hong Kong for the new date"]);
  });
  it("approved RMA units not batched: only on Thursday/Friday before the cut-off", () => {
    const r = { id: "r", account_code: "AMS-NL-901", number: "AMS-NL-901-RMA-02", status: "approved", created_at: "2026-11-02", units_without_evidence: 0, units_to_batch: 2, intermediary_id: "i" };
    expect(buildAlerts({ ...base, orders: [], rmas: [r] })).toEqual([]);
    expect(buildAlerts({ ...base, today: "2026-11-05", orders: [], rmas: [r] })[0].text).toBe("2 approved units not in Friday's batch yet");
  });
  it("evidence waiting more than 2 days", () => {
    const r = { id: "r", account_code: "X", number: "X-RMA-01", status: "requested", created_at: "2026-10-30T10:00:00Z", units_without_evidence: 1, units_to_batch: 0, intermediary_id: null };
    expect(buildAlerts({ ...base, orders: [], rmas: [r] })[0].kind).toBe("evidence");
  });
});

describe("escalation message (SOP §3.5)", () => {
  it("keeps the SOP order", () => {
    const t = escalationText({ client: "AMS-NL-901 Demo", order: "ORD-01", invoiceValue: 20000, what_happened: "Asks 2 %", evidence: null,
      figures: "2 % = USD 400", client_asks: "2 % discount", proposal: "Hold the list price", answer_by: "Thu 5 Nov 12:00 HK" });
    expect(t.split("\n").map((l) => l.split(":")[0])).toEqual(["Client", "Order", "Invoice value", "What happened", "Evidence", "Figures", "What the client asks", "What I propose", "Answer expected by"]);
    expect(t).toContain("Invoice value: USD 20,000.00");
  });
});

describe("queues", () => {
  it("Thursday queue: clients with an open order or RMA; sent this week = done", async () => {
    const { thursdayQueue, rmaAskQueue } = await import("./updates");
    const accounts = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const orders = [uo({ number: "ORD-01" }), uo({ number: "ORD-02", status: "delivered" })].map((o, i) => ({ ...o, account_id: i ? "b" : "a" }));
    const q = thursdayQueue(accounts, orders, [], [{ account_id: "a", kind: "thursday", week_start: "2026-11-02", sent_at: "2026-11-05T02:00:00Z" }], "2026-11-02");
    expect(q.map((x) => [x.account.id, Boolean(x.sent)])).toEqual([["a", true]]);
    const asks = rmaAskQueue([{ id: "i", name: "Global Connect" }, { id: "j", name: "ASR" }],
      [{ id: "a", status: "active", intermediary_id: "i" }, { id: "b", status: "closed", intermediary_id: "i" }], [], "2026-11-02");
    expect(asks.map((g) => [g.intermediary.name, g.clients.length])).toEqual([["Global Connect", 1]]);
  });
});

describe("daily report email time (18:00 HK, working days)", () => {
  it("due after 18:00 HK on a weekday, once a day", async () => {
    const { reportDue } = await import("./dates");
    const s = { time: "18:00", timezone: "Asia/Hong_Kong", weekdays: [1, 2, 3, 4, 5] };
    expect(reportDue(new Date("2026-11-03T09:59:00Z"), s, null).due).toBe(false); // 17:59 HK
    expect(reportDue(new Date("2026-11-03T10:00:00Z"), s, null)).toEqual({ due: true, date: "2026-11-03" });
    expect(reportDue(new Date("2026-11-03T12:00:00Z"), s, "2026-11-03").due).toBe(false);
    expect(reportDue(new Date("2026-11-07T11:00:00Z"), s, null).due).toBe(false); // Saturday
  });
});
