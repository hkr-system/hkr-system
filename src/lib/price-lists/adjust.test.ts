import { describe, expect, it } from "vitest";
import { baseOf, marginMarkup, priceTone } from "./adjust";

// iPhone 12 Pro 128 of the AMS demo list: base 255.41, RMA_c 0.5 %, Extra_c 0.5 % → list 257.96, floor 256.69
const row = { engine: 257.96, base: 255.41, rmaPct: 0.5, baseMarginPct: 6 };

describe("price colours", () => {
  it("engine price → normal; above base × (1 + RMA_c + 1 %) → green", () => {
    expect(priceTone({ ...row, price: 257.96 })).toBe("none");
    expect(priceTone({ ...row, price: 259.24 })).toBe("none");   // 255.41 × 1.015 = 259.24 → not above
    expect(priceTone({ ...row, price: 259.25 })).toBe("green");
  });
  it("below the engine price → yellow; below the real cost (255.41 ÷ 1.06 = 240.95) → red", () => {
    expect(priceTone({ ...row, price: 257.00 })).toBe("yellow");
    expect(priceTone({ ...row, price: 240.95 })).toBe("yellow");
    expect(priceTone({ ...row, price: 240.90 })).toBe("red");
  });
  it("without the base (specialist) the base comes from the floor", () => {
    expect(baseOf(null, 256.69, 0.5)!).toBeCloseTo(255.41, 1);
  });
  it("margin and markup on the real cost", () => {
    const m = marginMarkup(257.96, 255.41, 6);
    expect(m.cost).toBe(240.95);
    expect(m.margin!.toFixed(2)).toBe("6.59");
    expect(m.markup!.toFixed(2)).toBe("7.06");
  });
});
