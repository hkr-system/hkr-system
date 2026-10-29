import { describe, expect, it } from "vitest";
import { estimateCost, metaMarketForPhone, rateCategory, type MessageRates } from "./pricing";

const rates: MessageRates = {
  currency: "USD",
  as_of: "2026-10-28",
  rates: {
    NL: { marketing: 0.1597, utility: 0.02 },
    DE: { marketing: 0.1365 },
    WEU: { marketing: 0.0592 },
    LATAM: { marketing: 0.074 },
    NAM: { marketing: 0.025 },
  },
};

describe("metaMarketForPhone", () => {
  it("standalone markets", () => {
    expect(metaMarketForPhone("+31612345678")).toBe("NL");
    expect(metaMarketForPhone("+4915123456789")).toBe("DE");
    expect(metaMarketForPhone("+447911123456")).toBe("GB");
    expect(metaMarketForPhone("+5215512345678")).toBe("MX");
    expect(metaMarketForPhone("+77011234567")).toBe("KZ");
    expect(metaMarketForPhone("+79161234567")).toBe("RU");
  });
  it("regional groups", () => {
    expect(metaMarketForPhone("+32470123456")).toBe("WEU"); // Belgium
    expect(metaMarketForPhone("+50370123456")).toBe("LATAM"); // El Salvador
    expect(metaMarketForPhone("+420601123456")).toBe("CEEU"); // Czech Republic
    expect(metaMarketForPhone("+12025550123")).toBe("NAM"); // US
  });
  it("+1 Caribbean numbers by area code", () => {
    expect(metaMarketForPhone("+17875550123")).toBe("LATAM"); // Puerto Rico
    expect(metaMarketForPhone("+18095550123")).toBe("LATAM"); // Dominican Republic
  });
  it("unlisted countries and bad input go to Other", () => {
    expect(metaMarketForPhone("+3726123456")).toBe("GLO"); // Estonia
    expect(metaMarketForPhone(null)).toBe("GLO");
    expect(metaMarketForPhone("not a phone")).toBe("GLO");
  });
});

describe("estimateCost", () => {
  it("sums recipients × rate per market", () => {
    const phones = [...Array(100).fill("+31612345678"), ...Array(50).fill("+4915123456789"), "+32470123456"];
    const e = estimateCost(phones, "MARKETING", rates);
    expect(e.recipients).toBe(151);
    expect(e.total).toBe(Math.round((100 * 0.1597 + 50 * 0.1365 + 0.0592) * 100) / 100);
    expect(e.lines[0]).toMatchObject({ market: "NL", recipients: 100, rate: 0.1597 });
    expect(e.missingRates).toEqual([]);
  });
  it("uses the template category and flags missing rates", () => {
    const e = estimateCost(["+31612345678", "+4915123456789"], "UTILITY", rates);
    expect(e.total).toBe(0.02);
    expect(e.missingRates).toEqual(["Germany"]);
  });
  it("works without rates", () => {
    expect(estimateCost(["+31612345678"], "MARKETING", null)).toMatchObject({ total: 0, missingRates: ["Netherlands"], asOf: null });
  });
  it("maps template categories", () => {
    expect(rateCategory("MARKETING")).toBe("marketing");
    expect(rateCategory("AUTHENTICATION")).toBe("authentication");
    expect(rateCategory("UTILITY")).toBe("utility");
    expect(rateCategory(undefined)).toBe("utility");
  });
});
