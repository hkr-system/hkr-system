import { describe, expect, it } from "vitest";
import { brandOf, optionsApply, sameModel, samsungKey } from "./brands";
import { compareRows, modelKey, parseSamsungModel, parseSheetRows, rowLabel } from "./price-lists/models";
import { colorsFor, matchColor } from "./orders/colors";
import { suggest } from "./orders/model-search";
import { readOrder } from "./orders/magic";

// Model names exactly as in Samsung_US_version_100526.xlsx (names only — never prices in this public repo).
const FILE: [string, number, string, string | null][] = [
  ["NOTE 10", 256, "NOTE 10", null], ["NOTE 10 Plus", 256, "NOTE 10 Plus", null],
  ["S20 5G", 128, "S20 5G", null], ["S20 5G Plus", 128, "S20 5G Plus", null], ["S20 Ultra", 128, "S20 Ultra", null],
  ["NOTE 20 5G", 128, "NOTE 20 5G", null], ["NOTE 20 U 5G", 128, "NOTE 20 U 5G", null],
  ["S21 5G", 128, "S21 5G", null], ["S21 5G Plus", 128, "S21 5G Plus", null], ["S21 Ultra", 128, "S21 Ultra", null],
  ["S22", 128, "S22", null], ["S22 Plus", 128, "S22 Plus", null], ["S22Ultra", 128, "S22 Ultra", null],
  ["S23", 128, "S23", null], ["S23 Plus", 256, "S23 Plus", null], ["S23 Ultra", 256, "S23 Ultra", null],
  ["S23FE   S711U", 128, "S23 FE", "S711U"], ["S24       S921U", 128, "S24", "S921U"], ["S24+     S926U", 256, "S24+", "S926U"],
  ["S24 Ultra  S928U", 256, "S24 Ultra", "S928U"], ["S25       ", 128, "S25", null], ["S25+     ", 256, "S25+", null],
  ["S25 Ultra  ", 256, "S25 Ultra", null],
];

describe("brands", () => {
  it("brand from the model name", () => {
    expect(brandOf("iPhone 15 Pro")).toBe("iphone");
    expect(brandOf("S24 Ultra")).toBe("samsung");
    expect(brandOf("")).toBeNull();
    expect(optionsApply("S22")).toBe(false);
    expect(optionsApply("iPhone 13")).toBe(true);
    expect(optionsApply(null)).toBe(true);
  });
  it("one key for every way of writing a Samsung model", () => {
    for (const s of ["S24 Ultra", "Galaxy S24 Ultra", "s24u", "S24Ultra", "samsung galaxy s24 ultra 5G"]) expect(samsungKey(s)).toBe("s24 ultra");
    expect(samsungKey("S21 5G Plus")).toBe("s21 plus");
    expect(samsungKey("S24+")).toBe("s24 plus");
    expect(samsungKey("NOTE 20 U 5G")).toBe("note 20 ultra");
    expect(samsungKey("note10+")).toBe("note 10 plus");
    expect(samsungKey("S23 FE")).toBe("s23 fe");
    expect(sameModel("S25+", "Galaxy S25 Plus")).toBe(true);
    expect(sameModel("S25", "S25 Ultra")).toBe(false);
    expect(sameModel("iPhone 14", "iphone 14")).toBe(true);
  });
});

describe("Samsung price file", () => {
  it("keeps the names of the file, tidies the spacing, moves the model code to the note", () => {
    for (const [raw, gb, model, note] of FILE) expect(parseSamsungModel(raw, gb), raw).toEqual({ model, note });
  });
  it("reads the whole sheet as Samsung (never 'iPhone …')", () => {
    const rows = [['"NEW" grade A+++', "GB", "USD"], ...FILE.map(([raw, gb], i) => [raw, gb, 100 + i])];
    const out = parseSheetRows(rows, "samsung");
    expect(out.problems).toEqual([]);
    expect(out.rows.map((r) => r.model)).toEqual(FILE.map((f) => f[2]));
    expect(out.rows.every((r) => !r.model.startsWith("iPhone"))).toBe(true);
  });
  it("labels as in the file and sorts by generation, Ultra last", () => {
    expect(rowLabel({ model: "S24 Ultra", note: "S928U" })).toBe("S24 Ultra S928U");
    expect(rowLabel({ model: "iPhone 14", note: "esim+regular sim" })).toBe("iPhone 14 (esim+regular sim)");
    const sorted = [{ model: "S24 Ultra", storage_gb: 256 }, { model: "S24+", storage_gb: 256 }, { model: "S24", storage_gb: 128 }].sort(compareRows);
    expect(sorted.map((r) => r.model)).toEqual(["S24", "S24+", "S24 Ultra"]);
    expect(modelKey("S24 Ultra", 256)).toBe("s24 ultra|256");
  });
  it("every model of the file has its official colours", () => {
    for (const [, , model] of FILE) expect(colorsFor(model).length, model).toBeGreaterThan(2);
    expect(colorsFor("S24 Ultra").map((c) => c.name)).toContain("Titanium Violet");
    expect(colorsFor("Galaxy S25+").map((c) => c.name)).toContain("Icyblue");
    expect(matchColor("S24 Ultra", "black")?.name).toBe("Titanium Black");
    expect(matchColor("S24 Ultra", "violet")?.name).toBe("Titanium Violet");
    expect(matchColor("S23", "lavender")?.name).toBe("Lavender");
  });
});

describe("Samsung in orders", () => {
  const choices = FILE.map(([, gb, model, note]) => ({ key: modelKey(model, gb), model, storage_gb: gb, note }));
  it("search: s24u, s24 ultra, galaxy s25+, note 20 ultra", () => {
    expect(suggest(choices, "s24u")[0].model).toBe("S24 Ultra");
    expect(suggest(choices, "s24 ultra 256")[0].model).toBe("S24 Ultra");
    expect(suggest(choices, "s24")[0].model).toBe("S24");
    expect(suggest(choices, "galaxy s25+")[0].model).toBe("S25+");
    expect(suggest(choices, "note 20 ultra")[0].model).toBe("NOTE 20 U 5G");
    expect(suggest(choices, "s23 fe")[0].model).toBe("S23 FE");
  });
  it("magic reader: Samsung lines, no battery or CE", () => {
    const r = readOrder("30 pcs Galaxy S24 Ultra 256: 20 black, 10 violet\n15 s23 128 mixed\nAll with CE and new batteries");
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ model: "S24 Ultra", storage_gb: 256, qty: 30, mixed: false, battery: null, ce: false });
    expect(r.lines[0].colors).toEqual([{ color: "Titanium Black", qty: 20 }, { color: "Titanium Violet", qty: 10 }]);
    expect(r.lines[1]).toMatchObject({ model: "S23", storage_gb: 128, qty: 15, mixed: true, battery: null, ce: false });
    expect(sameModel(r.lines[0].model, "S24 Ultra")).toBe(true);
    const iphone = readOrder("10 iPhone 14 128 mixed with CE");
    expect(iphone.lines[0]).toMatchObject({ model: "iPhone 14", ce: true });
  });
});
