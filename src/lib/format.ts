// Display helpers. Dates are stored in UTC and shown in the viewer's time zone.

export function todayIn(timeZone: string): string {
  // YYYY-MM-DD for "today" in the given zone (en-CA formats as ISO date).
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function formatDateTime(iso: string | null | undefined, timeZone: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(date: string | null | undefined) {
  if (!date) return "—";
  // date-only values (YYYY-MM-DD) are shown as written, without time-zone shifts
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function shortZone(timeZone: string) {
  return timeZone === "Asia/Hong_Kong" ? "HK" : timeZone === "America/El_Salvador" ? "SV" : timeZone;
}

export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString();
}
