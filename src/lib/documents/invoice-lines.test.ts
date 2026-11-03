import { describe, expect, it } from "vitest";
import { buildInvoiceLines, invoiceFileBase, pctLabel, type SourceLine } from "./invoice-lines";
import { orderTotals } from "@/lib/orders/calc";

const line = (o: Partial<SourceLine>): SourceLine => ({ qty: 1, unitPrice: 0, batteryNew: true, batteryUnit: 10, batteryEligible: true, grade: "A+++", ...o });

describe("buildInvoiceLines — Kopious reference invoice (USDT, battery apart, customs + shipping)", () => {
  const lines = [
    line({ model: "iPhone 15 Pro Max", storageGb: 256, color: "White", qty: 10, unitPrice: 638.08 }),
    line({ model: "iPhone 15 Pro Max", storageGb: 256, color: "Natural", qty: 10, unitPrice: 638.08 }),
    line({ model: "iPhone 13 Pro Max", storageGb: 128, color: "Gold", qty: 10, unitPrice: 415.4 }),
    line({ model: "iPhone 13 Pro Max", storageGb: 128, color: "White", qty: 10, unitPrice: 415.4 }),
    line({ model: "iPhone 13 Pro Max", storageGb: 128, color: "Black", qty: 5, unitPrice: 415.4 }),
    line({ model: "iPhone 13 Pro Max", storageGb: 128, color: "Blue", qty: 5, unitPrice: 415.4 }),
  ];
  const r = buildInvoiceLines({ lines, batteryLineSeparate: true, ceText: null, freight: 150, customs: 200, rmaDiscount: 0, paymentMethod: "usdt", usdtFeePct: 0.8, shipCountry: "US" });

  it("groups colours per model and storage, like the reference", () => {
    expect(r.lines[0]).toEqual({ kind: "product", description: "iPhone 15 Pro Max / 256 GB / New Battery cell 0 Cycle / A+++ / Colors: White(10), Natural(10)", qty: 20, unit_price: 638.08, total: 12761.6 });
    expect(r.lines[1].description).toBe("iPhone 13 Pro Max / 128 GB / New Battery cell 0 Cycle / A+++ / Colors: Gold(10), White(10), Black(5), Blue(5)");
    expect(r.lines[1].total).toBe(12462);
  });
  it("adds battery, customs, shipping per unit and the USDT fee", () => {
    expect(r.lines.slice(2)).toEqual([
      { kind: "battery", description: "New battery cell", qty: 50, unit_price: 10, total: 500 },
      { kind: "customs", description: "Customs Clearance", qty: 50, unit_price: 4, total: 200 },
      { kind: "shipping", description: "Shipping HK to US", qty: 50, unit_price: 3, total: 150 },
      { kind: "usdt", description: "USDT Fee (0.8%)", qty: null, unit_price: null, total: 208.59 },
    ]);
  });
  it("total = the reference total and = the order total", () => {
    expect(r.total).toBe(26282.19);
    const o = orderTotals({ lines: lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, batteryNew: l.batteryNew, batteryUnit: l.batteryUnit, batteryEligible: true })), batteryLineSeparate: true, freight: 150, customs: 200, rmaDiscount: 0, paymentMethod: "usdt", depositPct: 10, usdtFeePct: 0.8 });
    expect(o.total).toBe(r.total);
  });
});

describe("buildInvoiceLines — other cases", () => {
  it("CE text, absorbed battery, iPhone 16 never says new battery", () => {
    const r = buildInvoiceLines({
      lines: [line({ model: "iPhone 14", storageGb: 256, color: "Black", qty: 90, unitPrice: 340 }), line({ model: "iPhone 16", storageGb: 128, color: "Black", qty: 5, unitPrice: 549.7, batteryEligible: false })],
      batteryLineSeparate: false, ceText: "CE Marked", freight: 0, customs: 0, rmaDiscount: 0, paymentMethod: "wire", usdtFeePct: 0.85, shipCountry: null,
    });
    expect(r.lines.map((l) => l.description)).toEqual([
      "iPhone 14 / 256 GB / New Battery cell 0 Cycle / CE Marked / A+++ / Colors: Black(90)",
      "iPhone 16 / 128 GB / UKCA / A+++ / Colors: Black(5)".replace("UKCA", "CE Marked"),
    ]);
    expect(r.lines.some((l) => l.kind === "battery" || l.kind === "usdt")).toBe(false);
    expect(r.total).toBe(r.lines.reduce((s, l) => s + l.total, 0));
  });
  it("shipping that does not split per unit is one amount; RMA discount is negative", () => {
    const r = buildInvoiceLines({ lines: [line({ model: "iPhone 13", storageGb: 128, qty: 3, unitPrice: 300 })], batteryLineSeparate: true, ceText: null, freight: 100, customs: 0, rmaDiscount: 25, paymentMethod: "wire", usdtFeePct: 0.85, shipCountry: "Italy" });
    expect(r.lines.find((l) => l.kind === "shipping")).toEqual({ kind: "shipping", description: "Shipping HK to Italy", qty: null, unit_price: null, total: 100 });
    expect(r.lines.find((l) => l.kind === "rma")?.total).toBe(-25);
    const cn = buildInvoiceLines({ lines: [line({ model: "iPhone 13", storageGb: 128, qty: 3, unitPrice: 300 })], batteryLineSeparate: true, ceText: null, freight: 0, customs: 0,
      rmaDiscount: 75, credits: [{ number: "AMS-NL-901-CN-01", amount: 25 }, { number: "AMS-NL-901-CN-02", amount: 50 }], paymentMethod: "wire", usdtFeePct: 0.85, shipCountry: null });
    expect(cn.lines.filter((l) => l.kind === "rma").map((l) => [l.description, l.total])).toEqual([["Credit note AMS-NL-901-CN-01", -25], ["Credit note AMS-NL-901-CN-02", -50]]);
    expect(cn.total).toBe(900 + 30 - 75);
    expect(r.total).toBe(900 + 30 + 100 - 25);
  });
  it("free-text lines keep their text", () => {
    const r = buildInvoiceLines({ lines: [line({ description: "Sample box", qty: 1, unitPrice: 50, batteryNew: false })], batteryLineSeparate: true, ceText: null, freight: 0, customs: 0, rmaDiscount: 0, paymentMethod: "wire", usdtFeePct: 0.85, shipCountry: null });
    expect(r.lines).toEqual([{ kind: "product", description: "Sample box", qty: 1, unit_price: 50, total: 50 }]);
  });
  it("labels and file names", () => {
    expect(pctLabel(0.85)).toBe("0.85%");
    expect(invoiceFileBase("KOP-US-004", "ORD-03", 1)).toBe("KOP-US-004_ORD-03_INV-HK");
    expect(invoiceFileBase("KOP-US-004", "ORD-03", 2)).toBe("KOP-US-004_ORD-03_INV-HK_v2");
  });
});

describe("buildInvoiceLines — colours and options per line (Nov 2 2026)", () => {
  const plainOf = (m: string, c: string) => ({ Midnight: "Black", Starlight: "White" } as Record<string, string>)[c] ?? null;
  const base = { batteryLineSeparate: true, ceText: null, freight: 0, customs: 0, rmaDiscount: 0, paymentMethod: "wire" as const, usdtFeePct: 0.85, shipCountry: null };
  it("split colours, options, CE per line", () => {
    const r = buildInvoiceLines({ ...base, ceLabel: "CE Marked", lines: [
      { qty: 50, unitPrice: 300, batteryNew: false, batteryUnit: 0, batteryEligible: true, model: "iPhone 14", storageGb: 128, batteryOption: "boosted100",
        ce: true, imeiMatching: true, colorSplit: [{ color: "Midnight", qty: 25 }, { color: "Starlight", qty: 25 }] },
      { qty: 10, unitPrice: 400, batteryNew: true, batteryUnit: 10, batteryEligible: true, model: "iPhone 15", storageGb: 128, batteryOption: "new", ce: false, colorsMixed: true },
    ] }, plainOf);
    expect(r.lines.map((l) => l.description)).toEqual([
      "iPhone 14 / 128 GB / Battery boosted to 100% / CE Marked / IMEI matching color / A+++ / Colors: Midnight/Black(25), Starlight/White(25)",
      "iPhone 15 / 128 GB / New Battery cell 0 Cycle / A+++ / Colors: Mixed",
      "New battery cell",
    ]);
    expect(r.total).toBe(50 * 300 + 10 * 400 + 10 * 10);
  });
  it("plain lines: 'Used iPhone 12 128GB' and nothing else", () => {
    const r = buildInvoiceLines({ ...base, plain: true, lines: [
      { qty: 5, unitPrice: 200, batteryNew: true, batteryUnit: 0, batteryEligible: true, model: "iPhone 12", storageGb: 128, batteryOption: "new", ce: true, colorsMixed: true },
    ] });
    expect(r.lines[0].description).toBe("Used iPhone 12 128GB");
  });
});
