import { describe, expect, it } from "vitest";
import { buildBoard, isoWeek, type BoardBatchInput } from "./board";

const now = new Date("2026-10-30T10:00:00Z"); // Friday
const u = (client: string, price: number | null, rmaClosed = false) => ({ client, price, rmaClosed });
const batch = (o: Partial<BoardBatchInput>): BoardBatchInput => ({
  id: "b", intermediary: "Global Connect", cutoff: "2026-10-30", status: "open", awb: null, hasLabel: false, shippedAt: null, receivedAt: null, units: [], ...o,
});

describe("isoWeek", () => {
  it("counts ISO weeks", () => {
    expect(isoWeek("2026-10-30")).toBe(44);
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2027-01-01")).toBe(53);
  });
});

describe("buildBoard", () => {
  const cols = buildBoard([
    batch({ id: "o1", units: [u("AMS", 100), u("AMS", 120), u("BER", 90)] }),
    batch({ id: "o2", intermediary: "ASR", hasLabel: true, cutoff: "2026-11-06", units: [u("MIL", 50)] }),
    batch({ id: "s1", status: "shipped", cutoff: "2026-10-23", awb: "77812245", shippedAt: "2026-10-27T09:00:00Z", units: [u("AMS", 80)] }),
    batch({ id: "r1", status: "received", cutoff: "2026-10-16", receivedAt: "2026-10-24T09:00:00Z", units: [u("AMS", 10, true), u("BER", 20, false)] }),
    batch({ id: "r2", status: "received", cutoff: "2026-10-09", receivedAt: "2026-10-17T09:00:00Z", units: [u("AMS", 10, true)] }),
    batch({ id: "old", status: "received", cutoff: "2026-06-05", receivedAt: "2026-06-12T09:00:00Z", units: [u("AMS", 10, true)] }),
  ], now);

  it("three stages left to right with counts", () => {
    expect(cols.map((c) => [c.n, c.key, c.cards.length])).toEqual([[1, "open", 2], [2, "shipped", 1], [3, "received", 2]]);
    expect(cols[0].units).toBe(4);
    expect(cols[0].clients).toBe(3);
    expect(cols[0].summary).toBe("4 units · 3 clients");
  });
  it("open cards: soonest cut-off first, value, label alert", () => {
    const [c1, c2] = cols[0].cards;
    expect(c1).toMatchObject({ id: "o1", title: "Global Connect · wk 44", units: 3, clients: 2, value: 310, whenTone: "warn" });
    expect(c1.notes[0]).toEqual({ tone: "warn", text: "Label missing" });
    expect(c2.notes[0]).toEqual({ tone: "ok", text: "Label uploaded" });
  });
  it("shipped cards show days in transit and AWB", () => {
    expect(cols[1].cards[0].when).toBe("3 days in transit");
    expect(cols[1].cards[0].notes[0].text).toBe("AWB 77812245 · shipped 27 Oct");
  });
  it("received cards: newest first, open units flagged, older than 90 days hidden", () => {
    expect(cols[2].cards.map((c) => c.id)).toEqual(["r1", "r2"]);
    expect(cols[2].cards[0].notes[0]).toEqual({ tone: "warn", text: "1 unit still to resolve" });
    expect(cols[2].cards[1].notes[0]).toEqual({ tone: "ok", text: "All resolved" });
    expect(cols[2].summary).toBe("3 units · 1 with units to resolve");
  });
  it("a missed cut-off is red", () => {
    const [c] = buildBoard([batch({ cutoff: "2026-10-23" })], now)[0].cards;
    expect(c.whenTone).toBe("danger");
    expect(c.when).toBe("cut-off was 23 Oct");
  });
});
