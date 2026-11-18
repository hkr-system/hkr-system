// Door-to-door prices in EUR for EU clients (Gabriel, Nov 18 2026). Pure: unit-tested in door-to-door.test.ts.
// Per unit:  EUR = round((client USD price + shipping if it is in USD) ÷ rate)
//                  + bracket fee (by that EUR amount) + fixed EUR fee + shipping if it is in EUR
// The rate is the official EUR→USD rate minus the company's spread (its bank's intermediation fee), editable before producing.
// Order-size charges (small orders, per-shipment fee) are not in the unit price: they print as notes under the list.

export type D2DBracket = { up_to: number | null; eur: number };   // up_to inclusive; null = "and above"
export type D2DConfig = {
  enabled: boolean;
  brackets: D2DBracket[];
  fixed_eur: number;                 // per unit, any price
  ship_amount: number;               // shipping Hong Kong → destination, per unit
  ship_currency: "EUR" | "USD";
  small_under: number | null;        // orders under N pcs …
  small_eur: number;                 // … pay this much more per unit
  shipment_eur: number;              // per shipment (e.g. customs clearance), any size
  fx_spread: number;                 // taken off the official rate (1.13 → 1.12 = 0.01)
};

export const EMPTY_D2D: D2DConfig = {
  enabled: false, brackets: [], fixed_eur: 0, ship_amount: 0, ship_currency: "EUR", small_under: null, small_eur: 0, shipment_eur: 0, fx_spread: 0,
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Reads a stored set-up (jsonb) safely: missing or bad values become 0 / empty. */
export function parseD2D(v: unknown): D2DConfig | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const brackets = (Array.isArray(o.brackets) ? o.brackets : [])
    .map((b) => ({ up_to: (b as D2DBracket).up_to === null || (b as D2DBracket).up_to === undefined || String((b as D2DBracket).up_to) === "" ? null : num((b as D2DBracket).up_to), eur: num((b as D2DBracket).eur) }))
    .sort((a, b) => (a.up_to ?? Infinity) - (b.up_to ?? Infinity));
  return {
    enabled: o.enabled === true, brackets, fixed_eur: num(o.fixed_eur), ship_amount: num(o.ship_amount),
    ship_currency: o.ship_currency === "USD" ? "USD" : "EUR",
    small_under: o.small_under === null || o.small_under === undefined || String(o.small_under) === "" ? null : Math.round(num(o.small_under)),
    small_eur: num(o.small_eur), shipment_eur: num(o.shipment_eur), fx_spread: num(o.fx_spread),
  };
}

/** The bracket fee for a EUR amount: the first bracket whose upper limit (inclusive) is ≥ the amount; null limit = above. */
export function bracketFee(eur: number, brackets: D2DBracket[]): number {
  for (const b of brackets) if (b.up_to === null || eur <= b.up_to) return b.eur;
  return 0;
}

/** The rate used: official EUR→USD minus the company's spread, 4 decimals. */
export const effectiveRate = (official: number, spread: number) => Math.round((official - spread) * 10000) / 10000;

/** One door-to-door unit price in EUR from the client's USD list price. */
export function d2dUnitPrice(usd: number, cfg: D2DConfig, rate: number): number {
  if (!(rate > 0)) throw new Error("rate must be positive");
  const usdIn = usd + (cfg.ship_currency === "USD" ? cfg.ship_amount : 0);
  const eur = r2(usdIn / rate);
  return r2(eur + bracketFee(eur, cfg.brackets) + cfg.fixed_eur + (cfg.ship_currency === "EUR" ? cfg.ship_amount : 0));
}

const eur = (n: number) => `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lines printed under a door-to-door list (client-facing: never the company's name). */
export function d2dNotes(cfg: D2DConfig, rate: number, rateDate: string | null): string[] {
  const out = [`Door-to-door prices in EUR: shipping from Hong Kong and import handling included.`,
    `Exchange rate used: 1 EUR = ${rate.toFixed(4)} USD${rateDate ? ` (${rateDate})` : ""}.`];
  if (cfg.small_under && cfg.small_eur) out.push(`Orders under ${cfg.small_under} pcs: +${eur(cfg.small_eur)} per unit.`);
  if (cfg.shipment_eur) out.push(`Customs clearance: +${eur(cfg.shipment_eur)} per shipment.`);
  return out;
}
