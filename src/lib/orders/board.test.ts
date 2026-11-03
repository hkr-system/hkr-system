import { describe, expect, it } from "vitest";
import { buildOrderBoard, lastMonths, monthLabel, type BoardOrder } from "./board";

const today = "2026-11-03";
const o = (p: Partial<BoardOrder>): BoardOrder => ({
  id: "x", number: "ORD-01", account_code: "AMS-NL-901", status: "invoiced", total_usd: 1000, pieces: 10, order_date: "2026-10-30",
  eta_date: null, since: "2026-10-30", payment_awaiting: false, deposit_payable: 100, deposit_confirmed: 0, balance_ok: false,
  imei_count: 0, label_ok: false, tracking: null, ...p,
});

describe("orders board", () => {
  const cols = buildOrderBoard([
    o({ id: "a", since: "2026-10-28" }),                                               // invoiced, deposit due 6 days → still only "due" (never overdue)
    o({ id: "b", since: "2026-11-02", payment_awaiting: true }),                       // proof to confirm
    o({ id: "c", status: "in_preparation", eta_date: "2026-11-01" }),                   // ETA passed
    o({ id: "d", status: "ready_to_ship", since: "2026-10-30" }),                       // balance due, ready 4 days
    o({ id: "e", status: "balance_paid", imei_count: 50, label_ok: true }),             // clear to ship
    o({ id: "f", status: "closed", since: "2026-08-01" }),                              // closed in August → not in November
    o({ id: "h", status: "closed", since: "2026-11-01" }),                              // closed this month
    o({ id: "g", status: "delivered", since: "2026-08-20", total_usd: 500 }),           // open until closed
  ], today);

  it("nine stages left to right with count and value", () => {
    expect(cols.map((c) => c.status)).toEqual(["quoted", "invoiced", "deposit_paid", "in_preparation", "ready_to_ship", "balance_paid", "shipped", "delivered", "closed"]);
    const inv = cols[1];
    expect([inv.cards.length, inv.value, inv.units, inv.alerts]).toEqual([2, 2000, 20, 2]);
  });
  it("longest waiting first, with what is missing", () => {
    expect(cols[1].cards.map((c) => [c.id, c.daysText])).toEqual([["a", "6 days"], ["b", "1 day"]]);
    expect(cols[1].cards[0].notes).toEqual([{ tone: "warn", text: "Deposit due" }]);
    expect(cols[1].cards[1].notes[0].text).toBe("Payment proof to confirm");
    expect(cols[3].cards[0].notes[0]).toEqual({ tone: "danger", text: "ETA 1 Nov passed" });
    expect(cols[4].cards[0].notes[0].text).toBe("Balance due · ready 4 days");
    expect(cols[5].cards[0].notes[0]).toEqual({ tone: "ok", text: "Clear to ship — add the AWB" });
  });
  it("closed orders by the month they closed; open orders always", () => {
    expect(cols[8].cards.map((c) => c.id)).toEqual(["h"]);
    expect(cols[7].cards.map((c) => c.id)).toEqual(["g"]);
    const aug = buildOrderBoard([o({ id: "f", status: "closed", since: "2026-08-01" })], today, "2026-08");
    expect(aug[8].cards.map((c) => c.id)).toEqual(["f"]);
  });
  it("month list", () => { expect(lastMonths("2026-11-03", 3)).toEqual(["2026-11", "2026-10", "2026-09"]); expect(monthLabel("2026-11")).toBe("November 2026"); });
  it("no deposit expected when the intermediary keeps it", () => {
    const [, inv] = buildOrderBoard([o({ deposit_payable: 0 })], today);
    expect(inv.cards[0].notes).toEqual([{ tone: "muted", text: "Deposit kept by the intermediary" }]);
  });
});
