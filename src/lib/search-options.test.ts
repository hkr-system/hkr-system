import { describe, expect, it } from "vitest";
import { rankOptions } from "./search-options";

const countries = ["Nicaragua", "Guatemala", "Guadeloupe", "El Salvador", "Bosnia and Herzegovina", "Côte d'Ivoire", "Falkland Islands (Islas Malvinas)"]
  .map((c) => ({ value: c, label: c }));

describe("rankOptions", () => {
  it("shows everything when nothing is typed", () => {
    expect(rankOptions(countries, "")).toHaveLength(countries.length);
  });
  it("puts names that start with the text first", () => {
    expect(rankOptions(countries, "gua").map((o) => o.label)).toEqual(["Guatemala", "Guadeloupe", "Nicaragua"]);
  });
  it("ignores accents and case, every word must match", () => {
    expect(rankOptions(countries, "cote").map((o) => o.label)).toEqual(["Côte d'Ivoire"]);
    expect(rankOptions(countries, "salv el").map((o) => o.label)).toEqual(["El Salvador"]);
    expect(rankOptions(countries, "malvinas").map((o) => o.label)).toEqual(["Falkland Islands (Islas Malvinas)"]);
  });
  it("word starts beat matches in the middle", () => {
    expect(rankOptions(countries, "herz").map((o) => o.label)).toEqual(["Bosnia and Herzegovina"]);
  });
});
