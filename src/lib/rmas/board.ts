// EU batch board (Gabriel, Oct 30 2026): batches left to right by stage —
// 1 Open (collecting until the Friday cut-off) → 2 Shipped to HK → 3 Received in HK.
// Pure: the page passes the rows and "now"; unit-tested.

export type BoardStage = "open" | "shipped" | "received";
export const BOARD_STAGES: { key: BoardStage; n: number; label: string; hint: string }[] = [
  { key: "open", n: 1, label: "Open", hint: "collecting" },
  { key: "shipped", n: 2, label: "Shipped to HK", hint: "in transit" },
  { key: "received", n: 3, label: "Received in HK", hint: "last 90 days" },
];

export type BoardBatchInput = {
  id: string; intermediary: string; cutoff: string; status: BoardStage;
  awb: string | null; hasLabel: boolean; shippedAt: string | null; receivedAt: string | null;
  units: { client: string; price: number | null; rmaClosed: boolean }[];
};
export type Tone = "warn" | "ok" | "muted" | "danger";
export type BoardCard = {
  id: string; title: string; when: string; whenTone: Tone; units: number; clients: number; value: number;
  notes: { tone: Tone; text: string }[];
};
export type BoardColumn = { key: BoardStage; n: number; label: string; hint: string; cards: BoardCard[]; units: number; clients: number; summary: string };

const DAY = 86400_000;

/** ISO week number of a yyyy-mm-dd date. */
export function isoWeek(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / DAY + 1) / 7);
}

const shortDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
const days = (from: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / DAY));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function buildBoard(batches: BoardBatchInput[], now: Date, receivedDays = 90): BoardColumn[] {
  const today = now.toISOString().slice(0, 10);
  return BOARD_STAGES.map((st) => {
    const mine = batches
      .filter((b) => b.status === st.key)
      .filter((b) => st.key !== "received" || !b.receivedAt || days(b.receivedAt, now) <= receivedDays)
      .sort((a, b) => (st.key === "open" ? a.cutoff.localeCompare(b.cutoff) : (b.receivedAt ?? b.shippedAt ?? b.cutoff).localeCompare(a.receivedAt ?? a.shippedAt ?? a.cutoff)));
    const cards = mine.map<BoardCard>((b) => {
      const clients = new Set(b.units.map((u) => u.client)).size;
      const value = Math.round(b.units.reduce((s, u) => s + (u.price ?? 0), 0) * 100) / 100;
      const notes: BoardCard["notes"] = [];
      let when = ""; let whenTone: Tone = "muted";
      if (st.key === "open") {
        const late = b.cutoff < today;
        when = late ? `cut-off was ${shortDate(b.cutoff)}` : `cut-off Fri ${shortDate(b.cutoff)} 12:00`;
        whenTone = late ? "danger" : b.cutoff === today ? "warn" : "muted";
        notes.push(b.hasLabel ? { tone: "ok", text: "Label uploaded" } : { tone: "warn", text: "Label missing" });
        if (!b.units.length) notes.push({ tone: "muted", text: "Empty: add the waiting units" });
      } else if (st.key === "shipped") {
        when = b.shippedAt ? `${plural(days(b.shippedAt, now), "day")} in transit` : "shipped";
        whenTone = b.shippedAt && days(b.shippedAt, now) > 7 ? "warn" : "muted";
        notes.push({ tone: "muted", text: b.awb ? `AWB ${b.awb}${b.shippedAt ? ` · shipped ${shortDate(b.shippedAt)}` : ""}` : "No AWB" });
      } else {
        when = b.receivedAt ? `received ${shortDate(b.receivedAt)}` : "received";
        const open = b.units.filter((u) => !u.rmaClosed).length;
        notes.push(open ? { tone: "warn", text: `${plural(open, "unit")} still to resolve` } : { tone: "ok", text: "All resolved" });
      }
      return { id: b.id, title: `${b.intermediary} · wk ${isoWeek(b.cutoff)}`, when, whenTone, units: b.units.length, clients, value, notes };
    });
    const units = cards.reduce((s, c) => s + c.units, 0);
    const clients = new Set(mine.flatMap((b) => b.units.map((u) => u.client))).size;
    const pending = cards.filter((c) => c.notes.some((n) => n.tone === "warn")).length;
    const summary = st.key === "open" ? `${plural(units, "unit")} · ${plural(clients, "client")}`
      : st.key === "shipped" ? `${plural(units, "unit")} in transit`
        : `${plural(units, "unit")}${pending ? ` · ${pending} with units to resolve` : ""}`;
    return { ...st, cards, units, clients, summary };
  });
}
