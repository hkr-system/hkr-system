// Google-style filtering for every dropdown (Gabriel, Nov 4 2026): accents and case ignored, every word typed must appear,
// options that START with what you typed come first ("gua" → Guatemala, Guadeloupe … before Nicaragua).
export type Opt = { value: string; label: string; disabled?: boolean };

export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function rankOptions(options: Opt[], query: string): Opt[] {
  const q = fold(query);
  if (!q) return options;
  const words = q.split(" ");
  const scored: { o: Opt; score: number; i: number }[] = [];
  options.forEach((o, i) => {
    const label = fold(o.label);
    if (!words.every((w) => label.includes(w))) return;
    const starts = label.split(/[\s(/,-]+/);
    const score = (label.startsWith(q) ? 0 : starts.some((t) => t.startsWith(words[0])) ? 1 : 2);
    scored.push({ o, score, i });
  });
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).map((x) => x.o);
}
