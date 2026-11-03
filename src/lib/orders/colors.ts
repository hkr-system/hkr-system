// Official Apple colours per iPhone model (Apple's tech-spec pages), each with its plain colour in brackets
// — "Midnight (Black)" — so the team and the client read the same thing (Gabriel, Nov 2 2026).
// Order lines carry either "Mixed" or a split by these colours that must add up to the line quantity.

export type ModelColor = { name: string; plain: string };
const C = (name: string, plain: string): ModelColor => ({ name, plain });

const IP12 = [C("Black", "Black"), C("White", "White"), C("(PRODUCT)RED", "Red"), C("Green", "Green"), C("Blue", "Blue"), C("Purple", "Purple")];
const IP12PRO = [C("Graphite", "Black"), C("Silver", "White"), C("Gold", "Gold"), C("Pacific Blue", "Blue")];
const IP13 = [C("Midnight", "Black"), C("Starlight", "White"), C("Blue", "Blue"), C("Pink", "Pink"), C("(PRODUCT)RED", "Red"), C("Green", "Green")];
const IP13PRO = [C("Graphite", "Black"), C("Silver", "White"), C("Gold", "Gold"), C("Sierra Blue", "Blue"), C("Alpine Green", "Green")];
const IP14 = [C("Midnight", "Black"), C("Starlight", "White"), C("Blue", "Blue"), C("Purple", "Purple"), C("(PRODUCT)RED", "Red"), C("Yellow", "Yellow")];
const IP14PRO = [C("Space Black", "Black"), C("Silver", "White"), C("Gold", "Gold"), C("Deep Purple", "Purple")];
const IP15 = [C("Black", "Black"), C("Blue", "Blue"), C("Green", "Green"), C("Yellow", "Yellow"), C("Pink", "Pink")];
const IP15PRO = [C("Black Titanium", "Black"), C("White Titanium", "White"), C("Blue Titanium", "Blue"), C("Natural Titanium", "Grey")];
const IP16 = [C("Black", "Black"), C("White", "White"), C("Pink", "Pink"), C("Teal", "Green"), C("Ultramarine", "Blue")];
const IP16PRO = [C("Black Titanium", "Black"), C("White Titanium", "White"), C("Natural Titanium", "Grey"), C("Desert Titanium", "Gold")];
const IP16E = [C("Black", "Black"), C("White", "White")];

const CATALOG: [RegExp, ModelColor[]][] = [
  [/^iphone 12( mini)?$/i, IP12], [/^iphone 12 pro( max)?$/i, IP12PRO],
  [/^iphone 13( mini)?$/i, IP13], [/^iphone 13 pro( max)?$/i, IP13PRO],
  [/^iphone 14( plus)?$/i, IP14], [/^iphone 14 pro( max)?$/i, IP14PRO],
  [/^iphone 15( plus)?$/i, IP15], [/^iphone 15 pro( max)?$/i, IP15PRO],
  [/^iphone 16e$/i, IP16E], [/^iphone 16( plus)?$/i, IP16], [/^iphone 16 pro( max)?$/i, IP16PRO],
];

/** Official colours of a model ("iPhone 14 Pro Max" → Space Black, Silver, Gold, Deep Purple); [] when unknown. */
export function colorsFor(model: string | null | undefined): ModelColor[] {
  const m = String(model ?? "").replace(/\s+/g, " ").trim();
  return CATALOG.find(([re]) => re.test(m))?.[1] ?? [];
}

/** "Midnight (Black)"; the same word twice is shown once: "Black". */
export const colorLabel = (c: ModelColor) => (c.name.toLowerCase() === c.plain.toLowerCase() ? c.name : `${c.name} (${c.plain})`);

/** A colour as the client writes it ("black", "midnight", "space black") → the model's official colour. */
export function matchColor(model: string, word: string): ModelColor | null {
  const w = word.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  if (!w) return null;
  const list = colorsFor(model);
  const norm = (s: string) => s.toLowerCase().replace(/[()]/g, "").replace("productred", "red").trim();
  return list.find((c) => norm(c.name) === w || norm(c.name).replace(" titanium", "") === w)
    ?? list.find((c) => c.plain.toLowerCase() === w)
    ?? (w === "red" ? list.find((c) => c.plain === "Red") ?? null : null)
    ?? (["grey", "gray", "graphite"].includes(w) ? list.find((c) => c.plain === "Grey" || c.name === "Graphite") ?? null : null);
}

/** Generation number of a model name ("iPhone 14 Pro" → 14). */
export const generation = (model: string | null | undefined) => Number(/(\d{2})/.exec(String(model ?? ""))?.[1] ?? 0);

// Battery options — one selector per line (Gabriel, Nov 2 2026). Only "New batteries" adds the separate
// "New battery cell" invoice line (US$/unit editable on the line); the others only change the description.
export const BATTERY_OPTIONS = [
  { value: "new", label: "New batteries", invoice: "New Battery cell 0 Cycle" },
  { value: "boosted100", label: "Boosted to 100%", invoice: "Battery boosted to 100%" },
  { value: "bh85_boosted", label: "85%+ BH + Boosted", invoice: "Battery health 85%+ (boosted)" },
  { value: "bh80", label: "80%+ BH (iPhone 14 and newer)", invoice: "Battery health 80%+" },
] as const;
export type BatteryOption = (typeof BATTERY_OPTIONS)[number]["value"];
export const batteryAllowed = (opt: BatteryOption, model: string | null | undefined) => opt !== "bh80" || generation(model) >= 14;

/** iPhone 16 series never carries the separate battery line (brief §6). */
export const batteryLineEligible = (model: string | null | undefined) => !/iphone 16/i.test(String(model ?? ""));

export type ColorSplit = { color: string; qty: number }[];

/** Sales views: a line by model + GB becomes one row per colour (Mixed when no split); old SKU lines keep their colour. */
export function expandByColor<T extends { qty: number; model?: string | null; storage_gb?: number | null; colors?: unknown; colors_mixed?: boolean;
  skus?: { model: string; storage_gb: number; color: string } | null }>(l: T): (T & { skus: { model: string; storage_gb: number; color: string } })[] {
  const model = l.model ?? l.skus?.model; const gb = l.storage_gb ?? l.skus?.storage_gb;
  if (!model || !gb) return [];
  const split = (Array.isArray(l.colors) ? l.colors : []) as ColorSplit;
  if (split.length) return split.map((c) => ({ ...l, qty: c.qty, skus: { model, storage_gb: gb, color: c.color } }));
  return [{ ...l, skus: { model, storage_gb: gb, color: l.skus?.color && !l.colors_mixed ? l.skus.color : "Mixed" } }];
}
/** Validator: a specific split must add up to the line quantity (50 = 25 + 25, never 25 + 26). */
export function splitProblem(qty: number, mixed: boolean, split: ColorSplit): string | null {
  if (mixed) return null;
  const used = split.filter((s) => s.qty > 0);
  if (!used.length) return "Choose Mixed or give the quantity per colour.";
  const sum = used.reduce((s, x) => s + x.qty, 0);
  return sum === qty ? null : `The colours add up to ${sum} but the line has ${qty} units.`;
}
