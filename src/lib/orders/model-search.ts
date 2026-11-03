// "Google-style" suggestions for the model field (Gabriel, Nov 2 2026): type "14 pro 256", "ip15pm", "13 mini"
// and get the client's models ranked. Pure, unit-tested.

export type Searchable = { key: string; model: string; storage_gb: number; note: string | null };

/** Lower-case words with the usual shortcuts expanded: ip → iphone, pm / promax → pro max, 256gb → 256. */
export function queryWords(q: string): string[] {
  return q.toLowerCase()
    .replace(/(\d+)\s*(gb|g)\b/g, "$1")
    .replace(/\b1\s*tb\b/g, "1024")
    .replace(/\bip(?:hone)?\s*(\d)/g, "iphone $1")
    .replace(/(\d{2})(e)?\s*(pm|promax)\b/g, "$1$2 pro max")
    .replace(/(\d{2})(pro|plus|mini|max)\b/g, "$1 $2")
    .replace(/\bpm\b|\bpromax\b/g, "pro max")
    .split(/[^a-z0-9]+/).filter(Boolean).filter((w) => w !== "iphone");
}

/** Best matches first: every word must appear; the model's own words count more than the note. */
export function suggest<T extends Searchable>(items: T[], q: string, limit = 8): T[] {
  const words = queryWords(q);
  if (!words.length) return items.slice(0, limit);
  const wantsTier = (w: string) => ["pro", "max", "plus", "mini"].includes(w);
  const scored: { item: T; score: number }[] = [];
  for (const it of items) {
    const modelWords = it.model.toLowerCase().split(/\s+/).filter((w) => w !== "iphone");
    const all = [...modelWords, String(it.storage_gb), ...(it.note ?? "").toLowerCase().split(/[^a-z0-9]+/)];
    let score = 0; let ok = true;
    for (const w of words) {
      if (modelWords.includes(w) || String(it.storage_gb) === w) score += 3;
      else if (all.some((a) => a.startsWith(w))) score += 1;
      else { ok = false; break; }
    }
    if (!ok) continue;
    // "14 pro" should not rank "14 Pro Max" above "14 Pro"; "14" should rank the plain 14 first
    const extra = modelWords.filter((m) => wantsTier(m) && !words.includes(m)).length;
    scored.push({ item: it, score: score * 10 - extra });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}
