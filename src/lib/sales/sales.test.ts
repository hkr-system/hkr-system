import { describe, expect, it } from "vitest";
import { buckets, series, weekStart } from "./series";
import { suggestProjection } from "./projection";
import { accountHealth } from "./health";

describe("revenue series", () => {
  it("weeks start on Monday", () => {
    expect(weekStart("2026-10-29")).toBe("2026-10-26");
  });
  it("fills empty buckets with 0", () => {
    expect(buckets("2026-01-15", "2026-03-02", "month")).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    const s = series([{ order_date: "2026-02-10", total_usd: "100.5" }, { order_date: "2026-02-20", total_usd: 50, margin_usd: 5 }], "2026-01-01", "2026-03-31", "month");
    expect(s.map((x) => x.revenue)).toEqual([0, 150.5, 0]);
    expect(s[1].orders).toBe(2);
    expect(s[1].margin).toBe(5);
  });
});

describe("projection suggestion", () => {
  it("averages the last 3 months", () => {
    const a = new Map([["2026-08-01", 100], ["2026-09-01", 200], ["2026-10-01", 300]]);
    expect(suggestProjection("2026-11-01", a).value).toBe(200);
  });
  it("applies last year's seasonality when known", () => {
    const a = new Map([["2026-08-01", 100], ["2026-09-01", 100], ["2026-10-01", 100],
      ["2025-08-01", 100], ["2025-09-01", 100], ["2025-10-01", 100], ["2025-11-01", 150]]);
    expect(suggestProjection("2026-11-01", a).value).toBe(150);
  });
  it("says when there is no data", () => {
    expect(suggestProjection("2026-11-01", new Map()).value).toBeNull();
  });
});

describe("account health", () => {
  const base = { status: "active" as const, lastOrderDate: "2026-10-01", openOrders: 0, paymentToConfirm: 0, balanceDueReady: 0, depositDue: 0, etaPending: 0, openRmas: 0 };
  it("attention wins", () => {
    expect(accountHealth({ ...base, paymentToConfirm: 1 }, "2026-10-27", 45).level).toBe("attention");
  });
  it("inactive after N days", () => {
    expect(accountHealth({ ...base, lastOrderDate: "2026-08-01" }, "2026-10-27", 45).reasons[0]).toBe("no order for 87 days");
  });
  it("open orders = watch", () => {
    expect(accountHealth({ ...base, openOrders: 2 }, "2026-10-27", 45).level).toBe("watch");
  });
});
