import { describe, expect, it } from "vitest";
import { zonedToUtc } from "./format";

describe("zonedToUtc", () => {
  it("El Salvador is UTC-6 all year", () => expect(zonedToUtc("2026-10-28T09:30", "America/El_Salvador")).toBe("2026-10-28T15:30:00.000Z"));
  it("Hong Kong is UTC+8", () => expect(zonedToUtc("2026-10-28T09:30", "Asia/Hong_Kong")).toBe("2026-10-28T01:30:00.000Z"));
  it("Amsterdam follows summer time", () => {
    expect(zonedToUtc("2026-07-03T12:00", "Europe/Amsterdam")).toBe("2026-07-03T10:00:00.000Z");
    expect(zonedToUtc("2026-11-06T12:00", "Europe/Amsterdam")).toBe("2026-11-06T11:00:00.000Z");
  });
});
