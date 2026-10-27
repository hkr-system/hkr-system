import type { Database } from "@/types/database";
import { MARKETS, VOLUME_RANGES, type Market } from "./constants";
import { marketForCountry, normalizeCountry } from "./countries";
import { clean, normalizeEmail, normalizePhone, normalizeUrl } from "./normalize";
import { scoreLead, type ScoringConfig } from "./scoring";

export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export type LeadInput = {
  company?: unknown; contact_name?: unknown; title?: unknown; email?: unknown; phone?: unknown;
  country?: unknown; city?: unknown; market?: unknown; website?: unknown; linkedin_url?: unknown;
  business_type?: unknown; sells_iphones?: unknown; sells_refurbished?: unknown; volume_range?: unknown;
  volume_units_month?: unknown; heard_about?: unknown; language?: unknown; source?: unknown;
};

function bool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1", "si", "sí", "on"].includes(s)) return true;
  if (["no", "n", "false", "0", "off"].includes(s)) return false;
  return null;
}

// Turns raw input (form, edit page, import row) into clean lead columns.
// Returns the fields plus human-readable problems; never throws.
export function buildLeadFields(input: LeadInput) {
  const problems: string[] = [];
  const company = clean(input.company);
  if (!company) problems.push("Company is required.");

  const rawCountry = clean(input.country);
  const country = normalizeCountry(rawCountry);
  if (rawCountry && !country) problems.push(`Unknown country "${rawCountry}".`);

  const rawEmail = clean(input.email);
  const email = normalizeEmail(rawEmail);
  if (rawEmail && !email) problems.push(`Email "${rawEmail}" is not valid.`);

  const rawPhone = clean(input.phone);
  const phone_e164 = normalizePhone(rawPhone, country);
  if (rawPhone && !phone_e164) problems.push(`Phone "${rawPhone}" is not valid${country ? "" : " (add the country or a + prefix)"}.`);

  const marketIn = clean(input.market)?.toUpperCase();
  const market: Market | null =
    marketIn && (MARKETS as readonly string[]).includes(marketIn) ? (marketIn as Market) : marketForCountry(country);

  const volume_range = clean(input.volume_range);
  const range = VOLUME_RANGES.find((r) => r.value === volume_range);
  const unitsRaw = clean(input.volume_units_month);
  const volume_units_month = range ? range.units : unitsRaw && /^\d+$/.test(unitsRaw) ? Number(unitsRaw) : null;

  const business_type = clean(input.business_type);

  const language = clean(input.language)?.toLowerCase() === "es" ? "es" : "en";

  return {
    problems,
    fields: {
      company: company ?? "",
      contact_name: clean(input.contact_name),
      title: clean(input.title),
      email,
      phone_e164,
      country,
      city: clean(input.city),
      market,
      website: normalizeUrl(clean(input.website)),
      linkedin_url: normalizeUrl(clean(input.linkedin_url)),
      business_type, // known codes from the form; free text from imports is kept as written
      sells_iphones: bool(input.sells_iphones),
      sells_refurbished: bool(input.sells_refurbished),
      volume_range: range ? range.value : volume_range,
      volume_units_month,
      heard_about: clean(input.heard_about),
      language,
    } satisfies Partial<LeadInsert>,
  };
}

export function scoreFields(fields: Record<string, unknown>, config: ScoringConfig) {
  const r = scoreLead(fields, config);
  return {
    result: r,
    columns: {
      score: r.score,
      tier: r.tier,
      disqualified: r.disqualified,
      disqualify_reason: r.disqualifyReason,
    },
  };
}
