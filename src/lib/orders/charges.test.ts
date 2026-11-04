import { describe, expect, it } from "vitest";
import { orderTotals, shippingTotal, usdtPart } from "./calc";
import { buildInvoiceLines } from "@/lib/documents/invoice-lines";
import { chargeAmount, chargesTotal } from "@/components/orders/order-charges";

const line = { qty: 47, unitPrice: 300, batteryNew: false, batteryUnit: 0, batteryEligible: true };

describe("shipping and customs per unit or total (Nov 4 2026)", () => {
  it("per unit = US$ × units; total = the amount typed", () => {
    expect(shippingTotal("unit", 3.5, 999, 47)).toBe(164.5);
    expect(shippingTotal("total", 3.5, 200, 47)).toBe(200);
  });
  it("other charges and discounts count in the total, deposit and USDT fee", () => {
    const base = { lines: [line], batteryLineSeparate: true, freight: 141, customs: 100, rmaDiscount: 0, depositPct: 10, usdtFeePct: 0.85 };
    const wire = orderTotals({ ...base, charges: 50 - 150, paymentMethod: "wire" });
    expect(wire.total).toBe(14100 + 141 + 100 - 100);
    expect(wire.deposit).toBe(1424.1);
    const usdt = orderTotals({ ...base, charges: -100, paymentMethod: "usdt" });
    expect(usdt.usdtFee).toBe(121.05);   // 0.85 % of 14,241 = 121.0485
    const mixed = orderTotals({ ...base, charges: -100, paymentMethod: "mixed" });
    expect(mixed.usdtFee).toBe(0);       // mixed: the fee comes with each USDT payment
  });
  it("charge rows: qty × unit, or one amount; negatives are discounts", () => {
    expect(chargeAmount({ description: "Boxes", qty: "10", unit: "2.5", amount: "" })).toBe(25);
    expect(chargeAmount({ description: "Discount", qty: "", unit: "", amount: "-150" })).toBe(-150);
    expect(chargesTotal([{ description: "a", qty: "", unit: "", amount: "40" }, { description: "b", qty: "", unit: "", amount: "-15.5" }])).toBe(24.5);
  });
});

describe("invoice lines for shipping, customs and other charges", () => {
  const common = {
    lines: [{ qty: 47, unitPrice: 300, batteryNew: false, batteryUnit: 0, batteryEligible: true, model: "S24", storageGb: 128, colorsMixed: true }],
    batteryLineSeparate: true, ceText: null, rmaDiscount: 0, usdtFeePct: 0.85, shipCountry: "Guatemala",
  };
  it("per unit prints qty × unit; total prints one amount; charges and discounts one line each", () => {
    const r = buildInvoiceLines({
      ...common, paymentMethod: "wire", freight: 141, freightUnit: 3, customs: 100, customsUnit: null,
      charges: [{ description: "Shipping not charged on PHO-GT-028-INV-01", qty: null, unit: null, amount: 80 }, { description: "Discount", qty: null, unit: null, amount: -150 }],
    });
    expect(r.lines.slice(1)).toEqual([
      { kind: "customs", description: "Customs Clearance", qty: null, unit_price: null, total: 100 },
      { kind: "shipping", description: "Shipping HK to Guatemala", qty: 47, unit_price: 3, total: 141 },
      { kind: "other", description: "Shipping not charged on PHO-GT-028-INV-01", qty: null, unit_price: null, total: 80 },
      { kind: "other", description: "Discount", qty: null, unit_price: null, total: -150 },
    ]);
    expect(r.total).toBe(14100 + 100 + 141 + 80 - 150);
    const o = orderTotals({ lines: [line], batteryLineSeparate: true, freight: 141, customs: 100, charges: -70, rmaDiscount: 0, paymentMethod: "wire", depositPct: 10, usdtFeePct: 0.85 });
    expect(o.total).toBe(r.total);       // invoice total = order total, to the cent
  });
  it("a mixed order has no USDT fee line", () => {
    const r = buildInvoiceLines({ ...common, paymentMethod: "mixed", freight: 0, customs: 0 });
    expect(r.lines.some((l) => l.kind === "usdt")).toBe(false);
  });
});

describe("USDT part of a mixed payment (Gabriel's examples)", () => {
  it("5,042.50 arrives for 5,000: complete", () => {
    expect(usdtPart(5042.5, 5000, 0.85)).toEqual({ expected: 5042.5, fee: 42.5, feeLost: 0, applied: 5000 });
  });
  it("5,000 arrives: covers 5,000, the 42.50 fee is a financial loss", () => {
    expect(usdtPart(5000, 5000, 0.85)).toEqual({ expected: 5042.5, fee: 42.5, feeLost: 42.5, applied: 5000 });
  });
  it("4,900 arrives: fee lost and US$100 still due", () => {
    expect(usdtPart(4900, 5000, 0.85)).toEqual({ expected: 5042.5, fee: 42.5, feeLost: 42.5, applied: 4900 });
  });
  it("part of the fee arrives: only the missing part is lost", () => {
    expect(usdtPart(5020, 5000, 0.85)).toEqual({ expected: 5042.5, fee: 42.5, feeLost: 22.5, applied: 5000 });
  });
});
