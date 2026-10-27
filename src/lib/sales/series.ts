// Revenue over time (pure, unit-tested). Revenue = invoice total of orders from "Invoiced" on,
// dated by order date (brief §8 "Sales").

export type Grain = "day" | "week" | "month";
export type SaleRow = { order_date: string; total_usd: number | string; margin_usd?: number | string | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

// Monday of the ISO week
export function weekStart(date: string): string {
  const d = parse(date);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return iso(d);
}
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
export function bucketOf(date: string, grain: Grain) {
  return grain === "day" ? date.slice(0, 10) : grain === "week" ? weekStart(date) : monthStart(date);
}

// Every bucket between from and to (inclusive), so empty days/weeks/months show as 0.
export function buckets(from: string, to: string, grain: Grain): string[] {
  const out: string[] = [];
  let d = parse(bucketOf(from, grain));
  const end = parse(to);
  while (d <= end) {
    out.push(iso(d));
    if (grain === "day") d.setUTCDate(d.getUTCDate() + 1);
    else if (grain === "week") d.setUTCDate(d.getUTCDate() + 7);
    else d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return out;
}

export function series(rows: SaleRow[], from: string, to: string, grain: Grain) {
  const map = new Map(buckets(from, to, grain).map((b) => [b, { revenue: 0, orders: 0, margin: 0, marginKnown: false }]));
  for (const r of rows) {
    const b = map.get(bucketOf(r.order_date, grain));
    if (!b) continue;
    b.revenue += Number(r.total_usd);
    b.orders += 1;
    if (r.margin_usd !== null && r.margin_usd !== undefined) { b.margin += Number(r.margin_usd); b.marginKnown = true; }
  }
  return [...map.entries()].map(([start, v]) => ({ start, ...v, revenue: Math.round(v.revenue * 100) / 100 }));
}

export function bucketLabel(start: string, grain: Grain) {
  const d = parse(start);
  if (grain === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function addDays(date: string, days: number) {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
export function addMonths(date: string, months: number) {
  const d = parse(date);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}
