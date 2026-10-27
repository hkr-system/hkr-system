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

// "5h 12m left" until (iso + windowMs); empty when already passed.
export function timeLeft(iso: string | null | undefined, windowMs: number) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() + windowMs - Date.now();
  if (ms <= 0) return "";
  return `${Math.floor(ms / 3600_000)}h ${Math.floor((ms % 3600_000) / 60_000)}m left`;
}

// Converts a wall-clock time in `timeZone` ("2026-10-28T09:30") to a UTC ISO string.
export function zonedToUtc(local: string, timeZone: string): string {
  const [d, t = "00:00"] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const offset = (at: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(new Date(at)).map((p) => [p.type, p.value]),
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - at;
  };
  return new Date(guess - offset(guess - offset(guess))).toISOString();
}
