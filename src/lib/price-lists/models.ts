// Model names in the iPhonePrices file are typed by hand ("iPhone 13mini  ", "iPhone 15 PM 256 (esim+regular sim)").
// One canonical name per model ("iPhone 13 mini", "iPhone 15 Pro Max") lets a price match the SKUs of every colour.
// Unit-tested with the rows of Gabriel's file of 24 Oct 2026.

import { brandOf, type Brand } from "@/lib/brands";

export type ParsedRow = { model: string; storage_gb: number; note: string | null; price: number; line: number; raw: string };

/** "iPhone 15 PM 256 (esim+regular sim)" + 256 → { model: "iPhone 15 Pro Max", note: "esim+regular sim" } */
export function parseModel(raw: string, gb?: number): { model: string; note: string | null } {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  const notes: string[] = [];
  s = s.replace(/\(([^)]*)\)/g, (_, n: string) => { if (n.trim()) notes.push(n.trim()); return " "; });
  s = s.replace(/(\d+)\s*(mini|plus|pro|max)\b/gi, "$1 $2");          // 13mini → 13 mini
  if (gb) s = s.replace(new RegExp(`\\b${gb}\\s*(gb)?\\b`, "i"), " ");   // the storage typed inside the name
  s = s.replace(/\b\d{3,4}\s*gb\b/gi, " ");
  const words = s.split(" ").filter(Boolean).map((w) => {
    const l = w.toLowerCase();
    if (l === "iphone") return "iPhone";
    if (l === "pm" || l === "promax") return "Pro Max";
    if (l === "pro") return "Pro";
    if (l === "max") return "Max";
    if (l === "plus") return "Plus";
    if (l === "mini") return "mini";
    return w;
  });
  let model = words.join(" ").replace(/\s+/g, " ").trim();
  if (/^\d/.test(model)) model = `iPhone ${model}`;
  return { model, note: notes.length ? notes.join("; ") : null };
}

/**
 * Samsung names stay as in Samsung's file (Gabriel, Nov 4 2026): only the spacing is tidied ("S22Ultra" → "S22 Ultra",
 * "S23FE" → "S23 FE") and the model code ("S921U", "SM-S928U") goes to the note, printed after the name: "S24 S921U".
 */
export function parseSamsungModel(raw: string, gb?: number): { model: string; note: string | null } {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  const notes: string[] = [];
  s = s.replace(/\(([^)]*)\)/g, (_, n: string) => { if (n.trim()) notes.push(n.trim()); return " "; });
  s = s.replace(/\b(?:SM-)?[SNAF]\d{3}[A-Z0-9]{0,3}\b/gi, (code: string) => { notes.unshift(code.toUpperCase()); return " "; });
  if (gb) s = s.replace(new RegExp(`\\b${gb}\\s*(gb)?\\b`, "i"), " ");
  s = s.replace(/\b\d{3,4}\s*gb\b/gi, " ");
  s = s.replace(/\b([A-Za-z]{1,4}\d{1,2})(Ultra|Plus|FE|\+)/gi, "$1 $2").replace(/\s+\+/g, "+");
  return { model: s.replace(/\s+/g, " ").trim(), note: notes.length ? notes.join("; ") : null };
}

/** Key that matches a price row and a SKU (case and spacing insensitive). */
export const modelKey = (model: string, gb: number) => `${parseModel(model).model.toLowerCase()}|${gb}`;

/** Label shown in client outputs: "iPhone 14 (esim+regular sim)". */
export const rowLabel = (r: { model: string; note: string | null }) =>
  !r.note ? r.model : brandOf(r.model) === "samsung" && /^(SM-)?[SNAF]\d{3}/i.test(r.note) ? `${r.model} ${r.note}` : `${r.model} (${r.note})`;

/** Generation for sorting: "iPhone 15 Pro Max" → [15, 3]. */
export function modelSort(model: string): [number, number] {
  const m = /(\d+)/.exec(model);
  const gen = m ? Number(m[1]) : 0;
  const tier = /pro max|ultra|\bu\b/i.test(model) ? 3 : /pro/i.test(model) ? 2 : /plus|max|\+/i.test(model) ? 1 : /mini|\bfe\b/i.test(model) ? -1 : 0;
  return [gen, tier];
}
export function compareRows(a: { model: string; storage_gb: number }, b: { model: string; storage_gb: number }) {
  const [ga, ta] = modelSort(a.model); const [gb, tb] = modelSort(b.model);
  return ga - gb || ta - tb || a.model.localeCompare(b.model) || a.storage_gb - b.storage_gb;
}

/** Rows of a sheet (array of cell values per row): finds the "GB"/"USD" header, then model · GB · price. */
export function parseSheetRows(rows: unknown[][], brand: Brand = "iphone"): { rows: ParsedRow[]; problems: string[] } {
  const out: ParsedRow[] = []; const problems: string[] = [];
  let start = rows.findIndex((r) => r.some((c) => /^\s*gb\s*$/i.test(String(c ?? ""))) && r.some((c) => /usd|price/i.test(String(c ?? ""))));
  start = start < 0 ? 0 : start + 1;
  const seen = new Set<string>();
  for (let i = start; i < rows.length; i++) {
    const [a, b, c] = rows[i];
    const name = String(a ?? "").trim();
    if (!name && (b === null || b === undefined || b === "")) continue;
    const gb = Number(String(b ?? "").replace(/gb/i, "").trim());
    const price = Number(String(c ?? "").replace(/[$,\s]/g, ""));
    const line = i + 1;
    if (!name) { problems.push(`Row ${line}: model name missing.`); continue; }
    if (!(gb > 0)) { problems.push(`Row ${line} (${name}): storage (GB) is not a number.`); continue; }
    if (!(price > 0)) { problems.push(`Row ${line} (${name} ${gb}GB): price is not a number.`); continue; }
    const { model, note } = brand === "samsung" ? parseSamsungModel(name, gb) : parseModel(name, gb);
    const key = `${model.toLowerCase()}|${gb}`;
    if (seen.has(key)) { problems.push(`Row ${line}: ${model} ${gb}GB appears twice — the first price is kept.`); continue; }
    seen.add(key);
    out.push({ model, storage_gb: gb, note, price: Math.round(price * 100) / 100, line, raw: name });
  }
  if (!out.length && !problems.length) problems.push("No prices found: the file needs the columns model · GB · USD.");
  return { rows: out, problems };
}
