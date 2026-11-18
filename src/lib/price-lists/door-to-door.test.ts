import { describe, expect, it } from "vitest";
import { bracketFee, d2dNotes, d2dUnitPrice, effectiveRate, parseD2D, type D2DConfig } from "./door-to-door";

// INVENTED fees (public repo): the structure of Gabriel's two kinds of company, not their real figures.
const bracketed: D2DConfig = {
  enabled: true, brackets: [{ up_to: 100, eur: 4 }, { up_to: 300, eur: 7 }, { up_to: null, eur: 12 }],
  fixed_eur: 0, ship_amount: 2, ship_currency: "EUR", small_under: 40, small_eur: 1.5, shipment_eur: 0, fx_spread: 0.02,
};
const flat: D2DConfig = {
  enabled: true, brackets: [], fixed_eur: 5, ship_amount: 4, ship_currency: "USD", small_under: null, small_eur: 0, shipment_eur: 300, fx_spread: 0,
};

describe("door-to-door prices", () => {
  it("USD ÷ rate rounded to the cent, then the bracket fee and the EUR shipping", () => {
    // 220.00 / 1.10 = 200.00 € → bracket ≤300 = 7 € → + 2 € shipping = 209.00 €
    expect(d2dUnitPrice(220, bracketed, 1.1)).toBe(209);
    // 292.98 / 1.10 = 266.345… → 266.35 € (+7 +2) = 275.35 €
    expect(d2dUnitPrice(292.98, bracketed, 1.1)).toBe(275.35);
  });
  it("bracket limits are inclusive; null = and above", () => {
    expect(bracketFee(100, bracketed.brackets)).toBe(4);
    expect(bracketFee(100.01, bracketed.brackets)).toBe(7);
    expect(bracketFee(300, bracketed.brackets)).toBe(7);
    expect(bracketFee(5000, bracketed.brackets)).toBe(12);
    expect(bracketFee(50, [])).toBe(0);
  });
  it("USD shipping is added before the conversion; fixed EUR fee after", () => {
    // (296 + 4) / 1.20 = 250.00 € + 5 € = 255.00 €
    expect(d2dUnitPrice(296, flat, 1.2)).toBe(255);
  });
  it("rate = official minus spread, 4 decimals", () => {
    expect(effectiveRate(1.1342, 0.012)).toBe(1.1222);
    expect(effectiveRate(1.13, 0.01)).toBe(1.12);
  });
  it("notes: rate, small orders, per-shipment fee — never a company name", () => {
    expect(d2dNotes(bracketed, 1.12, "18 Nov 2026")).toEqual([
      "Door-to-door prices in EUR: shipping from Hong Kong and import handling included.",
      "Exchange rate used: 1 EUR = 1.1200 USD (18 Nov 2026).",
      "Orders under 40 pcs: +€1.50 per unit.",
    ]);
    expect(d2dNotes(flat, 1.2, null).at(-1)).toBe("Customs clearance: +€300.00 per shipment.");
  });
  it("reads a stored set-up safely", () => {
    const c = parseD2D({ enabled: true, brackets: [{ up_to: "", eur: "9" }, { up_to: 50, eur: 3 }], ship_currency: "XYZ", small_under: "" })!;
    expect(c.brackets).toEqual([{ up_to: 50, eur: 3 }, { up_to: null, eur: 9 }]);
    expect([c.ship_currency, c.small_under, c.fixed_eur]).toEqual(["EUR", null, 0]);
    expect(parseD2D(null)).toBeNull();
  });
  it("refuses a zero rate", () => {
    expect(() => d2dUnitPrice(100, flat, 0)).toThrow();
  });
});
