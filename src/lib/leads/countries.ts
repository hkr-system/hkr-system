import type { Market } from "./constants";

// ISO 3166-1 alpha-2 codes. Names come from the browser/Node Intl API.
export const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

// Default market by country. Editable on each lead; this only pre-fills it.
// Europe → EU, Latin America & Caribbean → LATAM, United States and its
// territories → US, everything else → ROW.
const EU = new Set(
  ("AD AL AT AX BA BE BG CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV " +
   "MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM UA VA XK").split(" "),
);
const LATAM = new Set(
  ("AG AI AR AW BB BL BO BQ BR BS BZ CL CO CR CU CW DM DO EC FK GD GF GP GT GY HN HT JM KN KY LC MF MQ MS MX " +
   "NI PA PE PY SR SV SX TC TT UY VC VE VG").split(" "),
);
const US = new Set("US PR VI GU AS MP UM".split(" "));

export function marketForCountry(code: string | null | undefined): Market | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (US.has(c)) return "US";
  if (EU.has(c)) return "EU";
  if (LATAM.has(c)) return "LATAM";
  return COUNTRY_CODES.includes(c) ? "ROW" : null;
}

const namesEn = new Intl.DisplayNames(["en"], { type: "region" });
const namesEs = new Intl.DisplayNames(["es"], { type: "region" });

export function countryName(code: string | null | undefined, lang: "en" | "es" = "en") {
  if (!code) return "—";
  try {
    return (lang === "es" ? namesEs : namesEn).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function countryOptions(lang: "en" | "es" = "en") {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, lang) })).sort((a, b) =>
    a.name.localeCompare(b.name, lang),
  );
}

const ALIASES: Record<string, string> = {
  UK: "GB", "UNITED KINGDOM": "GB", "GREAT BRITAIN": "GB", ENGLAND: "GB", HOLLAND: "NL", "THE NETHERLANDS": "NL",
  USA: "US", "U.S.A.": "US", "UNITED STATES OF AMERICA": "US", UAE: "AE", "EMIRATOS ARABES UNIDOS": "AE",
};

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

let lookup: Map<string, string> | null = null;

// Accepts "NL", "nl", "Netherlands", "Países Bajos"… Returns the ISO code or null.
export function normalizeCountry(input: string | null | undefined): string | null {
  if (!input) return null;
  const key = fold(input);
  if (!key) return null;
  if (key.length === 2 && COUNTRY_CODES.includes(key)) return key;
  if (ALIASES[key]) return ALIASES[key];
  if (!lookup) {
    lookup = new Map();
    for (const code of COUNTRY_CODES) {
      lookup.set(fold(countryName(code, "en")), code);
      lookup.set(fold(countryName(code, "es")), code);
    }
  }
  return lookup.get(key) ?? null;
}
