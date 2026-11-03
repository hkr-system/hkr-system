// Date helpers for the dashboard queues. All "today" values are Hong Kong dates (yyyy-mm-dd); pure.

export const DAY = 86400_000;

/** ISO weekday of a yyyy-mm-dd date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Monday of the week of `date` (the week the Thursday update and the RMA ask belong to). */
export const weekStart = (date: string) => addDays(date, 1 - isoWeekday(date));
/** Whole days from `from` to `to` (never negative); null without a date. */
export function daysBetween(from: string | null | undefined, to: string) {
  if (!from) return null;
  return Math.max(0, Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / DAY));
}
/** "12-Nov" — the date format of the SOP P9 reports. */
export function ddMmm(date: string) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}
/** "12 Nov" (EN) / "12 nov" (ES) for client messages. */
export function dayMonth(date: string, lang: "en" | "es") {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(d).replace(".", "");
}
/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
export const usd = (n: number) => `USD ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Is it time? Working day (setting weekdays) and past the report time on that clock, not yet sent that day. Pure. */
export function reportDue(now: Date, setting: { time?: string; timezone?: string; weekdays?: number[] } | null, last: string | null) {
  const tz = setting?.timezone ?? "Asia/Hong_Kong";
  const time = /^\d{2}:\d{2}$/.test(setting?.time ?? "") ? setting!.time! : "18:00";
  const days = Array.isArray(setting?.weekdays) && setting!.weekdays!.length ? setting!.weekdays! : [1, 2, 3, 4, 5];
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hhmm = `${parts.hour}:${parts.minute}`;
  return { due: days.includes(isoWeekday(date)) && hhmm >= time && last !== date, date };
}
