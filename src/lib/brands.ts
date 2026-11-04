// Brands HKR sells (Gabriel, Nov 4 2026): iPhone and Samsung. Every iPhone model is stored as "iPhone …" (base list
// reader, SKUs), so the brand of a model follows from its name — the same rule as SQL public.brand_of(). Pure, unit-tested.

export type Brand = "iphone" | "samsung";
export const BRANDS: Brand[] = ["iphone", "samsung"];
export const BRAND_LABEL: Record<Brand, string> = { iphone: "iPhone", samsung: "Samsung" };
export const isBrand = (s: unknown): s is Brand => s === "iphone" || s === "samsung";

/** "iPhone 15 Pro" → iphone; "S24 Ultra" → samsung; empty → null. */
export function brandOf(model: string | null | undefined): Brand | null {
  const m = String(model ?? "").trim();
  if (!m) return null;
  return /^iphone/i.test(m) ? "iphone" : "samsung";
}

/** Battery options and CE marks are iPhone only (Gabriel, Nov 4 2026). Free-text lines (no model) keep them. */
export const optionsApply = (model: string | null | undefined) => brandOf(model) !== "samsung";

/**
 * A Samsung model as one comparable key, whatever way it is written:
 * "S24 Ultra" = "Galaxy S24 Ultra" = "s24u" = "S24Ultra"; "S21 5G Plus" = "S21+"; "NOTE 20 U 5G" = "Note 20 Ultra".
 */
export function samsungKey(model: string): string {
  return ` ${model.toLowerCase()} `
    .replace(/\b(samsung|galaxy|5g)\b/g, " ")
    .replace(/\+/g, " plus ")
    .replace(/\b(s|a|note)\s*(\d{1,2})\s*(ultra|plus|fe|u)\b/g, "$1$2 $3")   // s22ultra · s24u · s23fe
    .replace(/\b(s|a)\s+(\d{2})\b/g, "$1$2")                                 // "s 24" → s24
    .replace(/\bnote(\d{1,2})\b/g, "note $1")                                // note10 → note 10
    .replace(/\bu\b/g, "ultra")
    .replace(/\bfan edition\b/g, "fe")
    .replace(/\s+/g, " ")
    .trim();
}

/** The same model? Samsung by its key, iPhone by its exact (case-insensitive) name. */
export function sameModel(a: string, b: string): boolean {
  if (brandOf(a) === "samsung" && brandOf(b) === "samsung") return samsungKey(a) === samsungKey(b);
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}
