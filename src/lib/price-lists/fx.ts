import "server-only";

// Official EUR → USD reference rate of the European Central Bank (free, no key) through Frankfurter (frankfurter.dev).
// Cached by Next for 6 hours. Returns null when it cannot be reached: the screen then asks for the rate by hand.
export type FxRate = { rate: number; date: string };

export async function getEurUsd(): Promise<FxRate | null> {
  const urls = ["https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD", "https://api.frankfurter.app/latest?from=EUR&to=USD"];
  for (const url of urls) {
    try {
      const r = await fetch(url, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(4000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { date?: string; rates?: { USD?: number } };
      const rate = Number(j.rates?.USD);
      if (rate > 0.5 && rate < 2 && j.date) return { rate, date: j.date };
    } catch { /* try the next one */ }
  }
  return null;
}
