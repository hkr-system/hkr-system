import { describe, expect, it } from "vitest";
import { buildInvoiceSheet, descriptionRows, type LayoutInput } from "./invoice-layout";

const input = (lines: number): LayoutInput => ({
  title: "COMMERCIAL INVOICE", number: "AMS-NL-901-INV-01", exporter: ["Exporter Ltd", "Street 1", "City", "Kowloon"],
  consignee: ["Client BV", "Street 2", "1000 AA Amsterdam", "Netherlands", "VAT NL123"], shipTo: ["Client BV"], date: "2026-11-03",
  notify: { contact: "Ops" }, shipment: { country: "Netherlands" }, freight: "FOB HK", paymentTerms: "Pre-payment", via: "FEDEX/DHL Express",
  from: "Hong Kong", packages: "1", netKg: "N/A", grossKg: "N/A", madeIn: "China",
  lines: Array.from({ length: lines }, (_, k) => ({ kind: k === lines - 1 ? "shipping" : "product", description: `Line ${k + 1}`, qty: 10, unit_price: 5, total: 50 })),
  payment: ["Payment: USDT TRC-20", "WALLET"], total: 500, signerName: "Signer", signerTitle: "Director", company: "Exporter Ltd",
  voice: "+852 1", whatsapp: "+852 2", orderDate: "2026-09-08", stamp: false,
});

describe("invoice in the original grid", () => {
  it("fills the original's cells (labels kept, data in place)", () => {
    const s = buildInvoiceSheet(input(3));
    const v = (a: string) => s.cells.get(a)?.v;
    expect(v("B1")).toBe("COMMERCIAL INVOICE");
    expect(v("B7")).toBe("Exporter Name and Address:");
    expect(v("V5")).toBe("Invoice No: AMS-NL-901-INV-01");
    expect([v("B8"), v("B9"), v("B11")]).toEqual(["Exporter Ltd", "Street 1", "Kowloon"]);
    expect(v("L11")).toBe("Netherlands, VAT NL123"); // a 5th consignee line joins the 4th row
    expect(v("T12")).toBe("Invoice Date: 11-03-2026");
    expect([v("B24"), v("D24"), v("Q24"), v("Y26"), v("B26")]).toEqual([1, "Line 1", "China", 50, null]); // only products get a number
    expect(v("D28")).toBe("Payment: USDT TRC-20");
    expect(v("Y33")).toBe(500);
    expect(v("O42")).toBe("September 8, 2026");
    expect(s.rows.length).toBe(43);
    expect(s.cells.get("D24")?.font).toEqual({ name: "Courier New", size: 9, bold: false, italic: false });
    expect(s.cells.get("B33")?.border).toBe("lrtb");
  });
  it("more lines push the footer down; the grid keeps its shape", () => {
    const s = buildInvoiceSheet({ ...input(12), stamp: true });
    // 12 lines + blank + 2 payment = 15 rows instead of 9 → footer 6 rows lower
    expect(s.cells.get("Y39")?.v).toBe(500);
    expect(s.merges).toContain("B39:X40");
    expect(s.rows.length).toBe(49);
    expect(s.stamp).toEqual({ fromCol: 10, fromRow: 42, toCol: 13, toRow: 47 });
  });
  it("wrapped descriptions get taller rows", () => {
    expect(descriptionRows("iPhone 15 Pro Max 256GB / New Battery cell 0 Cycle / A+++ / Colors: White(10), Natural(10)")).toBe(2);
    expect(descriptionRows("New battery cell")).toBe(1);
  });
});
