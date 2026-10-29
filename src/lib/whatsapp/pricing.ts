import { parsePhoneNumberFromString } from "libphonenumber-js";
import metadata from "libphonenumber-js/metadata.min.json";

// Meta charges per DELIVERED template message, by category and by the recipient's market
// (decided by the phone's country calling code). Rates live in settings.wa_message_rates
// (USD, Meta list prices, edited by admin in Settings). Groups below = Meta's rate-card mapping
// (developers.facebook.com → WhatsApp → Pricing, read 28 Oct 2026). Unlisted countries → "Other".

export const META_MARKET_LABELS: Record<string, string> = {
  AR: "Argentina", BD: "Bangladesh", BR: "Brazil", CL: "Chile", CO: "Colombia", EG: "Egypt", FR: "France", DE: "Germany",
  HK: "Hong Kong", HU: "Hungary", IN: "India", ID: "Indonesia", IQ: "Iraq", IL: "Israel", IT: "Italy", KZ: "Kazakhstan",
  KW: "Kuwait", MY: "Malaysia", MX: "Mexico", MA: "Morocco", NP: "Nepal", NL: "Netherlands", NG: "Nigeria",
  NAM: "North America", OM: "Oman", PK: "Pakistan", PE: "Peru", PL: "Poland", QA: "Qatar", RO: "Romania", RU: "Russia",
  SA: "Saudi Arabia", SG: "Singapore", ZA: "South Africa", ES: "Spain", LK: "Sri Lanka", TR: "Turkey", UA: "Ukraine",
  AE: "United Arab Emirates", GB: "United Kingdom", GLO: "Other", AFR: "Rest of Africa", APAC: "Rest of Asia Pacific",
  CEEU: "Rest of Central & Eastern Europe", LATAM: "Rest of Latin America", MDE: "Rest of Middle East",
  WEU: "Rest of Western Europe",
};

const GROUPS: Record<string, string> = {
  WEU: "AT BE DK FI IE NO PT SE CH",
  CEEU: "AL AM AZ BY BG HR CZ GE GR LV LT MD MK RS SK SI",
  LATAM: "BO CR DO EC SV GT HT HN JM NI PA PY PR UY VE",
  NAM: "US CA",
  APAC: "AF AU KH CN JP LA MN NZ PG PH TW TJ TH TM UZ VN",
  MDE: "BH JO LB YE",
  AFR: "DZ AO BJ BW BF BI CM TD CG ER ET GA GM GH GW CI KE LS LR LY MG MW ML MR MZ NA NE RW SN SL SO SS SD SZ TZ TG TN UG ZM ZW",
};
const GROUP_OF = new Map<string, string>();
for (const [g, list] of Object.entries(GROUPS)) for (const c of list.split(" ")) GROUP_OF.set(c, g);

/** Meta pricing market of a WhatsApp number (E.164), e.g. "+31612…" → "NL", "+1787…" (Puerto Rico) → "LATAM".
 *  Meta maps by country CALLING CODE (+44 → United Kingdom, incl. Jersey/Guernsey); only the shared +1 and +7 are
 *  split further (by area code: US/CA vs Caribbean; Russia vs Kazakhstan). */
export function metaMarketForPhone(phone: string | null | undefined): string {
  if (!phone) return "GLO";
  const p = parsePhoneNumberFromString(phone);
  if (!p) return "GLO";
  const cc = p.countryCallingCode;
  const shared = cc === "1" || cc === "7";
  const iso = shared ? p.country ?? (cc === "1" ? "US" : "RU") : CALLING_CODE_MAIN[cc];
  if (!iso) return "GLO";
  if (iso in META_MARKET_LABELS && !GROUPS[iso]) return iso;
  return GROUP_OF.get(iso) ?? "GLO";
}

// Main country of each calling code (first entry in libphonenumber's metadata, e.g. 44 → GB).
const CALLING_CODE_MAIN: Record<string, string> = Object.fromEntries(
  Object.entries((metadata as { country_calling_codes: Record<string, string[]> }).country_calling_codes).map(([cc, list]) => [cc, list[0]]),
);

export type RateCategory = "marketing" | "utility" | "authentication";
export type MessageRates = {
  currency: "USD";
  as_of: string; // date the prices were read from Meta
  rates: Record<string, Partial<Record<RateCategory, number>>>;
};

export function rateCategory(templateCategory: string | null | undefined): RateCategory {
  const c = (templateCategory ?? "").toLowerCase();
  return c === "marketing" || c === "authentication" ? c : "utility";
}

export type CostLine = { market: string; label: string; recipients: number; rate: number | null; subtotal: number };
export type CostEstimate = { total: number; recipients: number; lines: CostLine[]; missingRates: string[]; asOf: string | null };

/** Estimated cost of sending one template to these numbers (only recipients that will really be sent). */
export function estimateCost(phones: (string | null)[], templateCategory: string, rates: MessageRates | null): CostEstimate {
  const cat = rateCategory(templateCategory);
  const counts = new Map<string, number>();
  for (const p of phones) {
    const m = metaMarketForPhone(p);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const lines: CostLine[] = [...counts].map(([market, n]) => {
    const rate = rates?.rates?.[market]?.[cat];
    const r = typeof rate === "number" && Number.isFinite(rate) ? rate : null;
    return { market, label: META_MARKET_LABELS[market] ?? market, recipients: n, rate: r, subtotal: r === null ? 0 : round4(r * n) };
  }).sort((a, b) => b.subtotal - a.subtotal || b.recipients - a.recipients);
  return {
    total: round2(lines.reduce((s, l) => s + l.subtotal, 0)),
    recipients: phones.length,
    lines,
    missingRates: lines.filter((l) => l.rate === null).map((l) => l.label),
    asOf: rates?.as_of ?? null,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
