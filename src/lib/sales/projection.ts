// Suggested projection for a month (pure, unit-tested). Shown next to Gabriel's own figure,
// always with the reasoning in plain words:
//   base   = average of the last 3 months with data before the month
//   season = same month last year ÷ average of the 3 months before it last year (only if all known)
//   suggestion = base × season (or just base when there is no history for last year)

export function suggestProjection(month: string, actual: Map<string, number>) {
  const m = (offset: number) => {
    const d = new Date(`${month}T00:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
  };
  const last3 = [m(-1), m(-2), m(-3)].map((k) => actual.get(k)).filter((v): v is number => v !== undefined);
  if (!last3.length) return { value: null as number | null, reason: "No sales data for the last 3 months yet." };
  const base = last3.reduce((s, v) => s + v, 0) / last3.length;
  const ly = actual.get(m(-12));
  const lyBefore = [m(-13), m(-14), m(-15)].map((k) => actual.get(k));
  if (ly !== undefined && lyBefore.every((v) => v !== undefined)) {
    const lyBase = (lyBefore as number[]).reduce((s, v) => s + v, 0) / 3;
    if (lyBase > 0) {
      const season = ly / lyBase;
      return {
        value: Math.round(base * season),
        reason: `Average of the last ${last3.length} months (US$ ${Math.round(base).toLocaleString("en-US")}) × ${season.toFixed(2)}, the change seen in the same month last year.`,
      };
    }
  }
  return { value: Math.round(base), reason: `Average of the last ${last3.length} month${last3.length > 1 ? "s" : ""} (no complete history for the same month last year).` };
}
