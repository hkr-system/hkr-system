import type { Database } from "@/types/database";

export type LeadStage = Database["public"]["Enums"]["lead_stage"];
export type LeadTier = Database["public"]["Enums"]["lead_tier"];
export type Market = Database["public"]["Enums"]["market"];

// Order of the pipeline (brief §7).
export const STAGES: readonly LeadStage[] = [
  "New", "Contacted", "Replied", "Qualified", "Meeting", "Sample/Proposal", "Won", "Lost",
];
export const OPEN_STAGES: readonly LeadStage[] = STAGES.filter((s) => s !== "Won" && s !== "Lost");
export const TIERS: readonly LeadTier[] = ["A", "B", "C"];
export const MARKETS: readonly Market[] = ["EU", "LATAM", "US", "ROW"];

type Option = { value: string; en: string; es: string };

// Business types on the /apply form (approved by Gabriel, Oct 2026). The last six
// are the exclusions of brief §3 row 8: they disqualify the lead.
export const BUSINESS_TYPES: readonly (Option & { excluded?: boolean })[] = [
  { value: "refurbished_reseller", en: "Refurbished phone reseller / wholesaler", es: "Revendedor / mayorista de teléfonos reacondicionados" },
  { value: "online_seller", en: "Online seller (own shop or marketplace)", es: "Vendedor en línea (tienda propia o marketplace)" },
  { value: "phone_shop", en: "Phone shop (new and used)", es: "Tienda de teléfonos (nuevos y usados)" },
  { value: "distributor", en: "Distributor / importer", es: "Distribuidor / importador" },
  { value: "other", en: "Other", es: "Otro" },
  { value: "pawn_shop", en: "Pawn shop", es: "Casa de empeño", excluded: true },
  { value: "new_only_retailer", en: "Retailer of new phones only", es: "Tienda solo de teléfonos nuevos", excluded: true },
  { value: "large_chain", en: "Large retail chain", es: "Gran cadena minorista", excluded: true },
  { value: "dropshipping", en: "Dropshipping", es: "Dropshipping", excluded: true },
  { value: "operator", en: "Mobile operator / carrier", es: "Operador móvil", excluded: true },
  { value: "repair_only", en: "Repair shop only", es: "Solo taller de reparación", excluded: true },
];

// Volume ranges (approved Oct 2026). `units` is the lower bound stored in
// leads.volume_units_month, which the scoring rules read (≥400 → +25, 100–399 → +10).
export const VOLUME_RANGES: readonly (Option & { units: number })[] = [
  { value: "lt100", en: "Less than 100 units/month", es: "Menos de 100 unidades/mes", units: 0 },
  { value: "100-399", en: "100–399 units/month", es: "100–399 unidades/mes", units: 100 },
  { value: "400-999", en: "400–999 units/month", es: "400–999 unidades/mes", units: 400 },
  { value: "1000+", en: "1,000+ units/month", es: "1.000+ unidades/mes", units: 1000 },
];

export const HEARD_ABOUT: readonly Option[] = [
  { value: "linkedin", en: "LinkedIn", es: "LinkedIn" },
  { value: "google", en: "Google search", es: "Búsqueda en Google" },
  { value: "referral", en: "Recommended by someone", es: "Recomendación" },
  { value: "whatsapp", en: "WhatsApp message", es: "Mensaje de WhatsApp" },
  { value: "email", en: "Email from HKR", es: "Correo de HKR" },
  { value: "event", en: "Trade show or event", es: "Feria o evento" },
  { value: "other", en: "Other", es: "Otro" },
];

export function optionLabel(list: readonly Option[], value: string | null | undefined, lang: "en" | "es" = "en") {
  if (!value) return "—";
  return list.find((o) => o.value === value)?.[lang] ?? value;
}

export const STAGE_STYLES: Record<LeadStage, string> = {
  New: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  Contacted: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  Replied: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  Qualified: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  Meeting: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "Sample/Proposal": "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  Won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  Lost: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export const TIER_STYLES: Record<LeadTier, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-amber-500 text-white",
  C: "bg-zinc-400 text-white",
};
