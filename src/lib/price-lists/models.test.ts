import { describe, expect, it } from "vitest";
import { compareRows, modelKey, parseModel, parseSheetRows, rowLabel } from "./models";

describe("parseModel (names as typed in iPhonePrices_102426.xlsx)", () => {
  it.each([
    ["iPhone 12 Pro max", 128, "iPhone 12 Pro Max", null],
    ["iPhone 13mini  ", 256, "iPhone 13 mini", null],
    ["iPhone 14 (esim+regular sim)", 128, "iPhone 14", "esim+regular sim"],
    ["iPhone 14 plus (esim+regular sim)", 256, "iPhone 14 Plus", "esim+regular sim"],
    ["iPhone 15 Pro 128 (esim+regular sim)", 128, "iPhone 15 Pro", "esim+regular sim"],
    ["iPhone 15 PM 512 (esim+regular sim)", 512, "iPhone 15 Pro Max", "esim+regular sim"],
    ["iPhone 16 Pro max (esim+regular sim)", 256, "iPhone 16 Pro Max", "esim+regular sim"],
    ["iPhone 16e", 128, "iPhone 16e", null],
  ])("%s", (raw, gb, model, note) => { expect(parseModel(raw, gb)).toEqual({ model, note }); });
  it("matches a SKU model whatever the spelling", () => { expect(modelKey("iphone 16 pro max", 256)).toBe(modelKey("iPhone 16 Pro Max", 256)); });
  it("label for the client", () => { expect(rowLabel({ model: "iPhone 14", note: "esim+regular sim" })).toBe("iPhone 14 (esim+regular sim)"); });
});

describe("parseSheetRows", () => {
  it("reads model · GB · USD after the header and reports problems", () => {
    const { rows, problems } = parseSheetRows([
      ['"NEW" grade A+++', "GB", "USD"],
      ["iPhone 12 Pro", 128, 255.40894859],
      ["iPhone 15 PM 256 (esim+regular sim)", 256, 632.61],
      ["iPhone 13", "x", 10],
      ["iPhone 12 Pro", 128, 999],
      [null, null, null],
    ]);
    expect(rows.map((r) => [r.model, r.storage_gb, r.price])).toEqual([["iPhone 12 Pro", 128, 255.41], ["iPhone 15 Pro Max", 256, 632.61]]);
    expect(problems).toHaveLength(2);
  });
  it("sorts by generation, then tier, then GB", () => {
    const r = [{ model: "iPhone 15 Pro Max", storage_gb: 256 }, { model: "iPhone 13 mini", storage_gb: 128 }, { model: "iPhone 13", storage_gb: 256 }, { model: "iPhone 13", storage_gb: 128 }];
    expect(r.sort(compareRows).map((x) => `${x.model} ${x.storage_gb}`)).toEqual(["iPhone 13 mini 128", "iPhone 13 128", "iPhone 13 256", "iPhone 15 Pro Max 256"]);
  });
});
