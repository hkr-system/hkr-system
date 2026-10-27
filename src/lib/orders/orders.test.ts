import { describe, expect, it } from "vitest";
import { orderTotals } from "./calc";
import { luhnValid, parseImeis } from "./imei";
import { suggestCode, nameLetters } from "../accounts/code";
import { nextStatus } from "./constants";

const base = { batteryLineSeparate: true, freight: 0, customs: 0, rmaDiscount: 0, depositPct: 10, usdtFeePct: 0.85 };

describe("order totals (brief §6)", () => {
  it("10 % deposit and 90 % balance; SOP example invoice", () => {
    const t = orderTotals({ ...base, paymentMethod: "wire", lines: [{ qty: 1, unitPrice: 69363.7, batteryNew: false, batteryUnit: 0, batteryEligible: true }] });
    expect(t.deposit).toBe(6936.37);
    expect(t.balance).toBe(62427.33);
  });
  it("separate battery line only for eligible models", () => {
    const t = orderTotals({ ...base, paymentMethod: "wire", lines: [
      { qty: 100, unitPrice: 200, batteryNew: true, batteryUnit: 8, batteryEligible: true },
      { qty: 10, unitPrice: 300, batteryNew: true, batteryUnit: 10, batteryEligible: false }, // iPhone 16
    ] });
    expect(t.battery).toBe(800);
    expect(t.total).toBe(23800);
  });
  it("absorbed battery format has no battery line", () => {
    const t = orderTotals({ ...base, batteryLineSeparate: false, paymentMethod: "wire", lines: [{ qty: 100, unitPrice: 200, batteryNew: true, batteryUnit: 8, batteryEligible: true }] });
    expect(t.battery).toBe(0);
  });
  it("USDT adds 0.85 %", () => {
    const t = orderTotals({ ...base, paymentMethod: "usdt", lines: [{ qty: 100, unitPrice: 200, batteryNew: false, batteryUnit: 0, batteryEligible: true }] });
    expect(t.usdtFee).toBe(170);
    expect(t.total).toBe(20170);
  });
});

describe("IMEI parsing", () => {
  it("validates the Luhn check digit", () => {
    expect(luhnValid("490154203237518")).toBe(true);
    expect(luhnValid("490154203237519")).toBe(false);
  });
  it("finds IMEIs in messy text, reports problems", () => {
    const p = parseImeis("IMEI\n490154203237518\n490154203237519, 49015420323751 ; 490154203237518\nORD-12 2026-10-27");
    expect(p.valid).toEqual(["490154203237518"]);
    expect(p.badCheckDigit).toEqual(["490154203237519"]);
    expect(p.wrongLength).toEqual(["49015420323751"]);
    expect(p.repeated).toEqual(["490154203237518"]);
  });
});

describe("client code (SOP §2.1)", () => {
  it("three letters + country + next number", () => {
    expect(suggestCode("Brick Phones", "nl", 12)).toBe("BRI-NL-013");
    expect(nameLetters("Ñandú Móvil")).toBe("NAN");
    expect(nameLetters("A1")).toBe("AXX");
  });
});

describe("status flow", () => {
  it("one step at a time", () => {
    expect(nextStatus("quoted")).toBe("invoiced");
    expect(nextStatus("closed")).toBeNull();
  });
});
