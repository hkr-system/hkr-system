import { describe, expect, it } from "vitest";
import { applyCombined, clientPrices, extraDecision, priceWith, rmaDecision, signals, workingDays, type EngineInputs } from "./engine";

const inp = (o: Partial<EngineInputs>): EngineInputs => ({
  window_from: "2026-05-06", window_days: 180, window_orders: 5, unit_return_cost_usd: 45,
  orders_invoiced: 6, orders_closed: 5, invoiced_usd: 0, credits_usd: 0, units_returned: 0, recent_orders: [], units_3_months: 0, ...o,
});

describe("RMA_c — SOP 5.2 worked examples", () => {
  it("ratio case: 2,940 ÷ 210,000 = 1.40 %", () => {
    const d = rmaDecision(inp({ invoiced_usd: 210000, credits_usd: 2940 }));
    expect(d.case).toBe("ratio"); expect(d.value).toBe(1.4);
  });
  it("floor case: 360 ÷ 90,000 = 0.40 % → 0.50 %", () => {
    const d = rmaDecision(inp({ invoiced_usd: 90000, units_returned: 8 })); // 8 × 45 = 360
    expect(d.cost).toBe(360); expect(d.case).toBe("floor"); expect(d.value).toBe(0.5);
  });
  it("default case: 1 closed order → 1.00 % even with 0.00 %", () => {
    const d = rmaDecision(inp({ orders_closed: 1, invoiced_usd: 50000 }));
    expect(d.case).toBe("default"); expect(d.value).toBe(1);
  });
  it("cap case: 2,440 ÷ 120,000 = 2.03 % → 1.50 %", () => {
    const d = rmaDecision(inp({ invoiced_usd: 120000, credits_usd: 2440 }));
    expect(d.case).toBe("cap"); expect(d.value).toBe(1.5);
  });
});

describe("Extra_c — SOP 5.3 scoring + default until the 2nd order", () => {
  const o = (r: number, ready: string, bal: string) => ({ number: "ORD", order_date: ready, invoiced_on_list: r * 1000, list_value: 1000, ready_on: ready, balance_on: bal });
  it("pays the list, 350/month, balance in 2 days → S 4 → 2.0 % (max)", () => {
    const d = extraDecision(inp({ units_3_months: 1050, recent_orders: [o(0.99, "2026-10-26", "2026-10-28"), o(0.99, "2026-10-12", "2026-10-14"), o(0.99, "2026-09-28", "2026-09-30")] }));
    expect(d.score).toBe(4); expect(d.value).toBe(2);
  });
  it("negotiates, 1,200/month, 12 days → S −2 → 0 → 0.0 %", () => {
    const d = extraDecision(inp({ units_3_months: 3600, recent_orders: [o(0.93, "2026-10-01", "2026-10-19")] }));
    expect(d.signals.map((s) => s.points)).toEqual([0, -1, -1]);
    expect(d.score).toBe(0); expect(d.value).toBe(0);
  });
  it("fewer than 2 orders → default 1.0 %", () => {
    const d = extraDecision(inp({ orders_invoiced: 1 }));
    expect(d.case).toBe("default"); expect(d.value).toBe(1);
  });
  it("signals without data give 0 points", () => {
    const s = signals(inp({ units_3_months: 1500 })); // 500/month → 0
    expect(s.map((x) => [x.value === null, x.points])).toEqual([[true, 0], [false, 0], [true, 0]]);
  });
  it("working days skip weekends", () => {
    expect(workingDays("2026-10-30", "2026-11-03")).toBe(2); // Fri → Tue
    expect(workingDays("2026-10-30", "2026-10-30")).toBe(0);
  });
});

describe("prices — SOP 5.4 and 5.5", () => {
  it("285.00 × (1 + 0.9 % + 2.0 %) = 293.27, floor 287.57", () => {
    expect(clientPrices(285, 0.9, 2)).toEqual({ list: 293.27, floor: 287.57 });
  });
  it("288.00, RMA 1.4 %, Extra 1.0 % → 294.91 / 292.03", () => {
    expect(clientPrices(288, 1.4, 1)).toEqual({ list: 294.91, floor: 292.03 });
  });
  it("rounds half up in cents", () => { expect(priceWith(100, 0.005)).toBe(100.01); });
  it("combined max trims Extra_c", () => { expect(applyCombined(1.5, 2.5)).toEqual({ rma: 1.5, extra: 2 }); });
});
