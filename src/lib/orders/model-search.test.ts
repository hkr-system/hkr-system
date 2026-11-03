import { describe, expect, it } from "vitest";
import { queryWords, suggest } from "./model-search";

const items = [
  ["iPhone 13", 128], ["iPhone 13 mini", 128], ["iPhone 14", 128], ["iPhone 14 Pro", 128], ["iPhone 14 Pro", 256],
  ["iPhone 14 Pro Max", 256], ["iPhone 15 Pro Max", 256], ["iPhone 15 Pro Max", 512], ["iPhone 16", 128],
].map(([model, gb]) => ({ key: `${model}|${gb}`, model: model as string, storage_gb: gb as number, note: null }));
const keys = (q: string) => suggest(items, q).map((i) => i.key);

describe("model suggestions", () => {
  it("shortcuts", () => {
    expect(queryWords("ip15pm 256GB")).toEqual(["15", "pro", "max", "256"]);
    expect(queryWords("iPhone 13mini")).toEqual(["13", "mini"]);
  });
  it("ranks the exact model first", () => {
    expect(keys("14 pro")).toEqual(["iPhone 14 Pro|128", "iPhone 14 Pro|256", "iPhone 14 Pro Max|256"]);
    expect(keys("14")[0]).toBe("iPhone 14|128");
    expect(keys("ip15pm 512")).toEqual(["iPhone 15 Pro Max|512"]);
    expect(keys("13 mini")).toEqual(["iPhone 13 mini|128"]);
  });
  it("nothing matches → no suggestions (free text)", () => { expect(keys("galaxy s23")).toEqual([]); });
});
