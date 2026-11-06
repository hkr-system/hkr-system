// Official Apple colours per iPhone model (Apple's tech-spec pages), each with its plain colour in brackets
// — "Midnight (Black)" — so the team and the client read the same thing (Gabriel, Nov 2 2026).
// Order lines carry either "Mixed" or a split by these colours that must add up to the line quantity.

import { brandOf, samsungKey } from "@/lib/brands";

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

// Samsung (Gabriel, Nov 4 2026): official names from Samsung's launch colours, incl. the colours sold only online,
// matched on the model key ("S24 Ultra", "Galaxy S24 Ultra", "s24u" → "s24 ultra").
const NOTE10 = [C("Aura Glow", "Silver"), C("Aura Black", "Black"), C("Aura White", "White"), C("Aura Pink", "Pink"), C("Aura Red", "Red"), C("Aura Blue", "Blue")];
const NOTE10P = [C("Aura Glow", "Silver"), C("Aura Black", "Black"), C("Aura White", "White"), C("Aura Blue", "Blue")];
const S20 = [C("Cosmic Gray", "Grey"), C("Cloud Blue", "Blue"), C("Cloud Pink", "Pink"), C("Cloud White", "White"), C("Aura Red", "Red")];
const S20P = [C("Cosmic Gray", "Grey"), C("Cosmic Black", "Black"), C("Cloud Blue", "Blue"), C("Cloud White", "White"), C("Aura Blue", "Blue"), C("Aura Red", "Red")];
const S20U = [C("Cosmic Gray", "Grey"), C("Cosmic Black", "Black"), C("Cloud White", "White")];
const NOTE20 = [C("Mystic Bronze", "Bronze"), C("Mystic Gray", "Grey"), C("Mystic Green", "Green")];
const NOTE20U = [C("Mystic Bronze", "Bronze"), C("Mystic Black", "Black"), C("Mystic White", "White")];
const S21 = [C("Phantom Gray", "Grey"), C("Phantom White", "White"), C("Phantom Violet", "Purple"), C("Phantom Pink", "Pink")];
const S21P = [C("Phantom Black", "Black"), C("Phantom Silver", "Silver"), C("Phantom Violet", "Purple"), C("Phantom Gold", "Gold"), C("Phantom Red", "Red")];
const S21U = [C("Phantom Black", "Black"), C("Phantom Silver", "Silver"), C("Phantom Titanium", "Grey"), C("Phantom Navy", "Blue"), C("Phantom Brown", "Brown")];
const S22 = [C("Phantom Black", "Black"), C("Phantom White", "White"), C("Green", "Green"), C("Pink Gold", "Pink"), C("Graphite", "Grey"), C("Cream", "White"),
  C("Sky Blue", "Blue"), C("Violet", "Purple"), C("Bora Purple", "Purple")];
const S22U = [C("Phantom Black", "Black"), C("Phantom White", "White"), C("Burgundy", "Red"), C("Green", "Green"), C("Graphite", "Grey"), C("Sky Blue", "Blue"),
  C("Red", "Red"), C("Bora Purple", "Purple")];
const S23 = [C("Phantom Black", "Black"), C("Cream", "White"), C("Green", "Green"), C("Lavender", "Purple"), C("Graphite", "Grey"), C("Lime", "Yellow")];
const S23U = [...S23, C("Sky Blue", "Blue"), C("Red", "Red")];
const S23FE = [C("Mint", "Green"), C("Cream", "White"), C("Graphite", "Grey"), C("Purple", "Purple"), C("Indigo", "Blue"), C("Tangerine", "Orange")];
const S24 = [C("Onyx Black", "Black"), C("Marble Gray", "Grey"), C("Cobalt Violet", "Purple"), C("Amber Yellow", "Yellow"), C("Jade Green", "Green"),
  C("Sapphire Blue", "Blue"), C("Sandstone Orange", "Orange")];
const S24U = [C("Titanium Black", "Black"), C("Titanium Gray", "Grey"), C("Titanium Violet", "Purple"), C("Titanium Yellow", "Yellow"),
  C("Titanium Blue", "Blue"), C("Titanium Green", "Green"), C("Titanium Orange", "Orange")];
const S25 = [C("Navy", "Blue"), C("Icyblue", "Blue"), C("Mint", "Green"), C("Silver Shadow", "Silver"), C("Blueblack", "Black"), C("Coralred", "Red"),
  C("Pinkgold", "Pink")];
const S25U = [C("Titanium Silverblue", "Silver"), C("Titanium Black", "Black"), C("Titanium Whitesilver", "White"), C("Titanium Gray", "Grey"),
  C("Titanium Jetblack", "Black"), C("Titanium Jadegreen", "Green"), C("Titanium Pinkgold", "Pink")];

const SAMSUNG: Record<string, ModelColor[]> = {
  "note 10": NOTE10, "note 10 plus": NOTE10P, "s20": S20, "s20 plus": S20P, "s20 ultra": S20U, "note 20": NOTE20, "note 20 ultra": NOTE20U,
  "s21": S21, "s21 plus": S21P, "s21 ultra": S21U, "s22": S22, "s22 plus": S22, "s22 ultra": S22U, "s23": S23, "s23 plus": S23, "s23 ultra": S23U,
  "s23 fe": S23FE, "s24": S24, "s24 plus": S24, "s24 ultra": S24U, "s25": S25, "s25 plus": S25, "s25 ultra": S25U,
};

/** Official colours of a model ("iPhone 14 Pro Max" → Space Black, Silver, Gold, Deep Purple; "S24 Ultra" → Titanium Black…); [] when unknown. */
export function colorsFor(model: string | null | undefined): ModelColor[] {
  const m = String(model ?? "").replace(/\s+/g, " ").trim();
  if (brandOf(m) === "samsung") return SAMSUNG[samsungKey(m)] ?? [];
  return CATALOG.find(([re]) => re.test(m))?.[1] ?? [];
}

/** "Midnight (Black)"; the same word twice is shown once: "Black". */
export const colorLabel = (c: ModelColor) => (c.name.toLowerCase() === c.plain.toLowerCase() ? c.name : `${c.name} (${c.plain})`);

/** Samsung names without their family word: "Titanium Violet" → "violet", "Phantom Black" → "black". */
export const shortColor = (name: string) => name.toLowerCase().replace(/^(titanium|phantom|cosmic|cloud|aura|mystic) /, "");

/** A colour as the client writes it ("black", "midnight", "space black") → the model's official colour. */
export function matchColor(model: string, word: string): ModelColor | null {
  const w = word.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  if (!w) return null;
  const list = colorsFor(model);
  const norm = (s: string) => s.toLowerCase().replace(/[()]/g, "").replace("productred", "red").trim();
  return list.find((c) => norm(c.name) === w || norm(c.name).replace(" titanium", "") === w || shortColor(c.name) === w)
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

/** "eSIM only" can be chosen on iPhone 14, 15 and 16 series lines (Gabriel, Nov 6 2026) — same rule as SQL order_lines_sim_check. */
export const simChoice = (model: string | null | undefined) => /^\s*iphone\s*1[4-6]/i.test(String(model ?? ""));
