import { describe, expect, it } from "vitest";
import { planImport, readDescription, readInvoiceGrid, type Grid } from "./invoice-import";

// Invented data in the layout of HKR's Excel invoices (rows move between invoices; labels do not)
const grid = (extra: Grid = {}, shift = 0): Grid => {
  const r = (n: number) => n + shift;
  return {
    B1: "COMMERCIAL INVOICE", V5: "Invoice No: 10232026-1",
    L7: "Ultimate Consignee Name and Address:", T7: "Ship To Name and Address:",
    L8: "Demo Clearance B.V.", L9: "Demo street 1", L10: "Dordrecht", L11: "Netherlands", L12: "VAT: NL000B01",
    T8: "Demo Logistics / CO Demo Clearance", T9: "Demo road 4C", T10: "3045 AK ROTTERDAM", T11: "The Netherlands",
    L16: "Notify Party Name and Address:", T16: new Date("2026-10-23T00:00:00Z"),
    L17: "Contact:", N17: "Ana Demo", L18: "email:", N18: "ops@example.com", L19: "Phone:", N19: "+31 6 0000",
    L21: "Transportation:", B21: "Condition of Sale and Terms of Payment:",
    [`B${r(24)}`]: "Line #", [`D${r(24)}`]: "Harmonized Number, Product Description", [`S${r(24)}`]: "Quantity", [`V${r(24)}`]: "U. Price", [`Y${r(24)}`]: "Total Price",
    [`B${r(28)}`]: 1, [`D${r(28)}`]: "iPhone 14 / 128 GB / Physical SIM + eSIM / CE Marked / 80%+ BH / A+++ / Colors: Black(150)", [`S${r(28)}`]: 150, [`V${r(28)}`]: 300, [`Y${r(28)}`]: 45000,
    [`B${r(29)}`]: 2, [`D${r(29)}`]: "iPhone 15 Pro / 256 GB / eSIM Only / New Battery cell 0 Cycle / A+++ / Colors: Black Titanium(60), Natural(40)", [`S${r(29)}`]: 100, [`V${r(29)}`]: 500,
    [`D${r(30)}`]: "RMA's Credit note", [`Y${r(30)}`]: -600.5,
    [`D${r(31)}`]: "New battery cell", [`S${r(31)}`]: 100, [`V${r(31)}`]: 10, [`Y${r(31)}`]: 1000,
    [`D${r(32)}`]: "Shipping HK to Netherlands", [`S${r(32)}`]: 250, [`V${r(32)}`]: 3, [`Y${r(32)}`]: 750,
    [`D${r(33)}`]: "Bank: Demo Bank — Acct 000",
    [`B${r(34)}`]: "Total C.F.R.: USD", [`Y${r(34)}`]: 96149.5,
    [`O${r(42)}`]: "Date of Order:", [`O${r(43)}`]: new Date("2026-10-20T00:00:00Z"),
    ...extra,
  };
};

describe("import an HKR invoice from Excel (Nov 9 2026)", () => {
  it("reads the header blocks by their labels", () => {
    const inv = readInvoiceGrid(grid());
    expect(inv.number).toBe("10232026-1");
    expect([inv.invoiceDate, inv.orderDate]).toEqual(["2026-10-23", "2026-10-20"]);
    expect(inv.consignee).toEqual(["Demo Clearance B.V.", "Demo street 1", "Dordrecht", "Netherlands", "VAT: NL000B01"]);
    expect(inv.shipTo[0]).toBe("Demo Logistics / CO Demo Clearance");
    expect(inv.notify).toEqual({ contact: "Ana Demo", email: "ops@example.com", phone: "+31 6 0000" });
    expect(inv.problems).toEqual([]);
  });
  it("reads products (formula totals computed), battery, shipping, credit lines; bank text is ignored", () => {
    const inv = readInvoiceGrid(grid({}, 3));      // the table three rows lower: still found
    expect(inv.products.map((p) => [p.model, p.storage_gb, p.qty, p.unit, p.sim, p.ce, p.battery, p.mixed])).toEqual([
      ["iPhone 14", 128, 150, 300, "", true, "bh80", false], ["iPhone 15 Pro", 256, 100, 500, "esim", false, "new", false]]);
    expect(inv.products[1].colors).toEqual([{ color: "Black Titanium", qty: 60 }, { color: "Natural Titanium", qty: 40 }]);
    expect(inv.others).toEqual([{ description: "RMA's Credit note", qty: null, unit: null, amount: -600.5 }]);
    expect([inv.battery?.amount, inv.freight?.amount, inv.total]).toEqual([1000, 750, 96149.5]);
  });
  it("plans an order whose total is exactly the Excel total", () => {
    const p = planImport(readInvoiceGrid(grid()), 0.85);
    expect([p.batteryLineSeparate, p.batteryUnit, p.freight, p.paymentMethod]).toEqual([true, 10, { mode: "unit", unit: 3, total: 750 }, "wire"]);
    expect(p.charges).toEqual([{ description: "RMA's Credit note", qty: null, unit: null, amount: -600.5 }]);
    expect([p.total, p.matches]).toEqual([96149.5, true]);
  });
  it("a battery line that bills other units (e.g. iPhone 16 included) stays a charge line", () => {
    const p = planImport(readInvoiceGrid(grid({ "S31": 250, "Y31": 2500, "Y34": 97649.5 })), 0.85);
    expect(p.batteryLineSeparate).toBe(false);
    expect(p.charges[0]).toEqual({ description: "New battery cell", qty: 250, unit: 10, amount: 2500 });
    expect(p.matches).toBe(true);
  });
  it("USDT: today's fee → method USDT; an older rate → a charge line + Mixed", () => {
    const base = 96149.5;
    const now = planImport(readInvoiceGrid(grid({ D33: "USDT Fee (0.85%)", Y33: Math.round(base * 0.85) / 100, Y34: base + Math.round(base * 0.85) / 100 })), 0.85);
    expect([now.paymentMethod, now.matches]).toEqual(["usdt", true]);
    const old = planImport(readInvoiceGrid(grid({ D33: "USDT Fee (0.8%)", Y33: 769.2, Y34: base + 769.2 })), 0.85);
    expect([old.paymentMethod, old.matches, old.charges.at(-1)?.amount]).toEqual(["mixed", true, 769.2]);
  });
  it("descriptions: colours that do not add up → Mixed with a warning; unknown battery health → none", () => {
    const d = readDescription("iPhone 14 / 128 GB / CE Marked / 91%+ BH / A+++ / Colors: Black(400)", 150, 300)!;
    expect([d.mixed, d.battery]).toEqual([true, ""]);
    expect(d.problems.join(" ")).toMatch(/add up to 400.*150/);
    expect(d.problems.join(" ")).toMatch(/91%\+ BH/);
    expect(readDescription("Shipping", 1, 1)).toBeNull();
  });
  it("not an invoice → a clear problem", () => {
    expect(readInvoiceGrid({ A1: "hello" }).problems[0]).toMatch(/does not look like an HKR invoice/);
  });
});
