// Adjusted client prices (Gabriel, Nov 3 2026): the colour of a price and its margin / markup. Pure and unit-tested.
//   red    = below the real cost (Base ÷ (1 + base margin)) → a loss
//   yellow = below the engine price (Base × (1 + RMA_c + Extra_c))
//   green  = above Base × (1 + RMA_c + 1 %) (fixed 1 %, Gabriel)
//   none   = in between
export const GREEN_EXTRA_PCT = 1;

export type Tone = "red" | "yellow" | "green" | "none";

/** Base price of a row: the admin sees it; the others derive it from the floor (Floor = Base × (1 + RMA_c)). */
export const baseOf = (base: number | null, floor: number | null, rmaPct: number) =>
  base ?? (floor !== null ? floor / (1 + rmaPct / 100) : null);

export function priceTone(i: { price: number; engine: number | null; base: number | null; rmaPct: number; baseMarginPct: number }): Tone {
  const cents = (n: number) => Math.round(n * 100) / 100;
  if (i.base !== null && i.price < cents(i.base / (1 + i.baseMarginPct / 100))) return "red";
  if (i.engine !== null && i.price < i.engine) return "yellow";
  if (i.base !== null && i.price > cents(i.base * (1 + (i.rmaPct + GREEN_EXTRA_PCT) / 100))) return "green";
  return "none";
}

/** Margin (profit ÷ price) and markup (profit ÷ real cost), in %. */
export function marginMarkup(price: number, base: number, baseMarginPct: number) {
  const cost = base / (1 + baseMarginPct / 100);
  const profit = price - cost;
  return { cost: Math.round(cost * 100) / 100, margin: price > 0 ? (profit / price) * 100 : null, markup: cost > 0 ? (profit / cost) * 100 : null };
}
