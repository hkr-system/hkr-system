import { describe, expect, it } from "vitest";
import { countStates, listState, worstState } from "./send-status";

const today = "2026-11-19";
const valid = { version: 3, valid_until: "2026-12-03" };

describe("price list state per client", () => {
  it("up to date = the client has the current version and it is still valid", () => {
    expect(listState({ approved: valid, hasDraft: false, sentVersion: 3, today })).toBe("up_to_date");
  });
  it("not sent = approved and valid, but the client has an older version or none", () => {
    expect(listState({ approved: valid, hasDraft: false, sentVersion: 2, today })).toBe("not_sent");
    expect(listState({ approved: valid, hasDraft: false, sentVersion: null, today })).toBe("not_sent");
  });
  it("needs refresh = no list, or the valid-until date is reached (even if it was sent)", () => {
    expect(listState({ approved: null, hasDraft: false, sentVersion: null, today })).toBe("needs_refresh");
    expect(listState({ approved: { version: 3, valid_until: today }, hasDraft: false, sentVersion: 3, today })).toBe("needs_refresh");
  });
  it("a draft waiting for the admin comes first", () => {
    expect(listState({ approved: { version: 3, valid_until: "2026-11-01" }, hasDraft: true, sentVersion: 3, today })).toBe("waiting_approval");
    expect(listState({ approved: null, hasDraft: true, sentVersion: null, today })).toBe("waiting_approval");
  });
  it("an account counts once, by its worst brand", () => {
    expect(worstState(["up_to_date", "not_sent"])).toBe("not_sent");
    expect(worstState(["waiting_approval", "needs_refresh"])).toBe("needs_refresh");
    expect(countStates(["up_to_date", "up_to_date", "not_sent"])).toEqual({ needs_refresh: 0, waiting_approval: 0, not_sent: 1, up_to_date: 2 });
  });
});
