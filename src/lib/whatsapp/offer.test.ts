import { describe, expect, it } from "vitest";
import { offerMoney, offerText, rankDrops, type BaseRow } from "./offer";

// INVENTED prices (public repo).
const rows: BaseRow[] = [
  { model: "iPhone 15", storage_gb: 256, note: null, price_usd: 400, prev_price_usd: 420 },          // −20
  { model: "iPhone 16 Plus", storage_gb: 256, note: null, price_usd: 600, prev_price_usd: 635.5 },  // −35.5
  { model: "iPhone 16 Plus", storage_gb: 128, note: null, price_usd: 550, prev_price_usd: 560 },    // −10
  { model: "iPhone 13", storage_gb: 128, note: null, price_usd: 250, prev_price_usd: 240 },         // went up
  { model: "iPhone 17", storage_gb: 256, note: null, price_usd: 900, prev_price_usd: null },        // new
  { model: "iPhone 14", storage_gb: 128, note: null, price_usd: 280, prev_price_usd: 285 },         // −5
];

describe("offer", () => {
  it("ranks the drops in US$, biggest first; ups and new models are left out", () => {
    expect(rankDrops(rows).map((r) => [r.model, r.storage_gb, r.drop])).toEqual([
      ["iPhone 16 Plus", 256, 35.5], ["iPhone 15", 256, 20], ["iPhone 16 Plus", 128, 10], ["iPhone 14", 128, 5],
    ]);
  });
  it("money without decimals when whole", () => {
    expect(offerMoney(428, "EUR")).toBe("€428");
    expect(offerMoney(580.789, "EUR")).toBe("€580.79");
    expect(offerMoney(1567, "USD")).toBe("$1,567");
  });
  it("Europe: Gabriel's text with the prices in EUR door to door", () => {
    const t = offerText("eu", [{ model: "iPhone 15", storage_gb: 256, price: 428, qty: "1500" }, { model: "iPhone 16 Plus", storage_gb: 128, price: 528.83, qty: "" }], "€8.6");
    expect(t.split("\n")[0]).toBe("*HK Refurbished Stock — Special Volume Deal 🇪🇺*");
    expect(t).toContain("🔋 New Battery 100%, 0 Cycles available — +€8.6/unit");
    expect(t).toContain("📦 *Landed price, EU door-to-door:*");
    expect(t).toContain("▪️ iPhone 15 256GB — 1500 pcs @ *€428*\n▪️ iPhone 16 Plus 128GB @ *€528.83*");
    expect(t).toContain("🚚 Door to door price (NL/IT route)");
    expect(t).not.toContain("youtube");
  });
  it("US / LATAM: US$ prices and the fair videos at the end", () => {
    const t = offerText("us", [{ model: "iPhone 16 Plus", storage_gb: 128, price: 567, qty: "1000" }], "$10");
    expect(t).toContain("Special Volume Deal US");
    expect(t).toContain("— +$10/unit");
    expect(t).toContain("📦 *Landed price, US door-to-door:*");
    expect(t).toContain("▪️ iPhone 16 Plus 128GB — 1000 pcs @ *$567*");
    expect(t.trimEnd().endsWith("https://www.youtube.com/watch?v=YvvddcxhQh4")).toBe(true);
  });
});
