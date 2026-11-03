import { describe, expect, it } from "vitest";
import { readLine, readOrder } from "./magic";
import { colorLabel, colorsFor, matchColor, splitProblem } from "./colors";

describe("colours", () => {
  it("official colours with the plain one", () => {
    expect(colorsFor("iPhone 14 Pro Max").map(colorLabel)).toEqual(["Space Black (Black)", "Silver (White)", "Gold", "Deep Purple (Purple)"]);
    expect(colorsFor("iPhone 13").map(colorLabel)[0]).toBe("Midnight (Black)");
  });
  it("matches what the client writes", () => {
    expect(matchColor("iPhone 14", "black")?.name).toBe("Midnight");
    expect(matchColor("iPhone 15 Pro", "black")?.name).toBe("Black Titanium");
    expect(matchColor("iPhone 13", "red")?.name).toBe("(PRODUCT)RED");
    expect(matchColor("iPhone 16 Pro", "desert")?.name).toBe("Desert Titanium");
  });
  it("validator: 50 = 25 + 25, never 25 + 26", () => {
    expect(splitProblem(50, false, [{ color: "Midnight", qty: 25 }, { color: "(PRODUCT)RED", qty: 26 }])).toMatch(/51 .* 50/);
    expect(splitProblem(50, false, [{ color: "Midnight", qty: 25 }, { color: "(PRODUCT)RED", qty: 25 }])).toBeNull();
    expect(splitProblem(50, true, [])).toBeNull();
  });
});

describe("magic order reader", () => {
  it("50 pcs iPhone 14 Pro 256GB mixed", () => {
    expect(readLine("50 pcs iPhone 14 Pro 256GB mixed")).toMatchObject({ model: "iPhone 14 Pro", storage_gb: 256, qty: 50, mixed: true, problems: [] });
  });
  it("colour split with quantities", () => {
    const l = readLine("iPhone 13 128 x 30: 15 midnight, 15 starlight")!;
    expect(l).toMatchObject({ model: "iPhone 13", storage_gb: 128, qty: 30, mixed: false });
    expect(l.colors).toEqual([{ color: "Midnight", qty: 15 }, { color: "Starlight", qty: 15 }]);
  });
  it("short names and plain colours", () => {
    const l = readLine("20 15 pro max 256 black")!;
    expect(l).toMatchObject({ model: "iPhone 15 Pro Max", storage_gb: 256, qty: 20 });
    expect(l.colors).toEqual([{ color: "Black Titanium", qty: 20 }]);
    expect(readLine("ip14pm 128 - 40 pcs")).toMatchObject({ model: "iPhone 14 Pro Max", storage_gb: 128, qty: 40 });
  });
  it("Spanish, battery and CE", () => {
    const l = readLine("30 iPhone 14 128gb 20 negros 10 blancos batería nueva CE")!;
    expect(l.colors).toEqual([{ color: "Midnight", qty: 20 }, { color: "Starlight", qty: 10 }]);
    expect(l).toMatchObject({ qty: 30, battery: "new", ce: true });
    expect(readLine("iPhone 15 128 50 pcs boosted 85% BH")?.battery).toBe("bh85_boosted");
  });
  it("reports what it cannot read", () => {
    const l = readLine("iPhone 13 256 25 negros 26 rojos x 50")!;
    expect(l.problems.join(" ")).toMatch(/51.*50/);
  });
  it("whole message: skips greetings, applies order-wide options", () => {
    const r = readOrder("Hi David,\nplease quote:\n50x iPhone 14 128 mixed\n30 iPhone 13 Pro 256 sierra blue\nAll with CE and new batteries\nThanks");
    expect(r.lines.map((l) => [l.model, l.qty, l.ce, l.battery])).toEqual([["iPhone 14", 50, true, "new"], ["iPhone 13 Pro", 30, true, "new"]]);
    expect(r.skipped).toContain("Thanks");
  });
});
