import { describe, expect, it } from "vitest";
import { scoreLead, type ScoringConfig } from "./scoring";
import { marketForCountry, normalizeCountry } from "./countries";
import { normalizePhone } from "./normalize";

// Defaults of brief §3 row 8, as seeded in the foundation migration.
const config: ScoringConfig = {
  thresholds: { A: 70, B: 40 },
  settings: { lead_target_countries: ["NL"] },
  rules: [
    { label: "Target country", field: "country", operator: "in_setting", value: "lead_target_countries", points: 30, disqualify: false, active: true },
    { label: "Sells iPhones", field: "sells_iphones", operator: "eq", value: true, points: 25, disqualify: false, active: true },
    { label: "Volume ≥ 400", field: "volume_units_month", operator: "gte", value: 400, points: 25, disqualify: false, active: true },
    { label: "Volume 100–399", field: "volume_units_month", operator: "between", value: [100, 399], points: 10, disqualify: false, active: true },
    { label: "Sells refurbished", field: "sells_refurbished", operator: "eq", value: true, points: 10, disqualify: false, active: true },
    { label: "Excluded business type", field: "business_type", operator: "in", value: ["pawn_shop", "repair_only"], points: 0, disqualify: true, active: true },
  ],
};

describe("scoreLead", () => {
  it("scores a target-country iPhone refurbisher with 400+ units as Tier A (90)", () => {
    const r = scoreLead({ country: "NL", sells_iphones: true, volume_units_month: 400, sells_refurbished: true }, config);
    expect(r).toMatchObject({ score: 90, tier: "A", disqualified: false });
  });
  it("gives 100–399 units +10 and no country points outside the target list", () => {
    const r = scoreLead({ country: "MX", sells_iphones: true, volume_units_month: 100, sells_refurbished: true }, config);
    expect(r).toMatchObject({ score: 45, tier: "B" });
  });
  it("Tier C below 40", () => {
    expect(scoreLead({ sells_iphones: true, volume_units_month: 0 }, config).tier).toBe("C");
  });
  it("disqualifies a pawn shop whatever its score", () => {
    const r = scoreLead({ country: "NL", sells_iphones: true, volume_units_month: 1000, business_type: "pawn_shop" }, config);
    expect(r.disqualified).toBe(true);
    expect(r.disqualifyReason).toBe("Excluded business type");
  });
  it("an empty target-country list gives nobody the +30", () => {
    const r = scoreLead({ country: "NL" }, { ...config, settings: { lead_target_countries: [] } });
    expect(r.score).toBe(0);
  });
  it("ignores inactive rules", () => {
    const rules = config.rules.map((x) => ({ ...x, active: x.label !== "Sells iPhones" }));
    expect(scoreLead({ sells_iphones: true }, { ...config, rules }).score).toBe(0);
  });
});

describe("countries and phones", () => {
  it("maps countries to markets", () => {
    expect(marketForCountry("NL")).toBe("EU");
    expect(marketForCountry("SV")).toBe("LATAM");
    expect(marketForCountry("PR")).toBe("US");
    expect(marketForCountry("AE")).toBe("ROW");
  });
  it("reads country names in English and Spanish", () => {
    expect(normalizeCountry("Netherlands")).toBe("NL");
    expect(normalizeCountry("Países Bajos")).toBe("NL");
    expect(normalizeCountry("méxico")).toBe("MX");
    expect(normalizeCountry("UK")).toBe("GB");
    expect(normalizeCountry("Atlantis")).toBeNull();
  });
  it("normalizes phones to E.164", () => {
    expect(normalizePhone("06 12345678", "NL")).toBe("+31612345678");
    expect(normalizePhone("0031 6 12345678")).toBe("+31612345678");
    expect(normalizePhone("+503 7012 3456")).toBe("+50370123456");
    expect(normalizePhone("123")).toBeNull();
  });
});
