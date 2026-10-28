// Weekly EU batch cutoff (SOP P11, brief §3 row 11): Friday 12:00 on the Amsterdam clock
// (follows European summer time). Pure and unit-tested.
import { zonedToUtc } from "@/lib/format";

export type CutoffSetting = { weekday: number; time: string; timezone: string };
export const DEFAULT_CUTOFF: CutoffSetting = { weekday: 5, time: "12:00", timezone: "Europe/Amsterdam" };

function localDate(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
function isoWeekday(date: string) {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The next cutoff at or after `now`: { date (the Friday, local), at (UTC ISO) }.
export function nextCutoff(now: Date, setting: CutoffSetting = DEFAULT_CUTOFF) {
  const s = { ...DEFAULT_CUTOFF, ...setting };
  const today = localDate(now, s.timezone);
  let date = addDays(today, (s.weekday - isoWeekday(today) + 7) % 7);
  let at = zonedToUtc(`${date}T${s.time}`, s.timezone);
  if (new Date(at).getTime() <= now.getTime()) {
    date = addDays(date, 7);
    at = zonedToUtc(`${date}T${s.time}`, s.timezone);
  }
  return { date, at };
}

// "2 days 3 h" / "5 h 10 min" left, for the red counter on the RMAs page.
export function timeUntil(at: string, now: Date) {
  const ms = new Date(at).getTime() - now.getTime();
  if (ms <= 0) return "passed";
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return d > 0 ? `${d} day${d === 1 ? "" : "s"} ${h} h` : `${h} h ${m} min`;
}

// Everything the pages show about the next cut-off, computed at call time.
export function cutoffInfo(setting?: CutoffSetting, now: Date = new Date()) {
  const cut = nextCutoff(now, setting);
  const msLeft = new Date(cut.at).getTime() - now.getTime();
  return { ...cut, left: timeUntil(cut.at, now), msLeft };
}
