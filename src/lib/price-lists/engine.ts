// Price-list engine — SOP chapter 5 (Gabriel, Nov 2 2026). Pure: the page passes the inputs from
// public.price_engine_inputs(account) and the parameters from the confidential "engine" settings. Unit-tested
// with the SOP worked examples (5.2 four cases, 5.3 scoring, 5.4 iPhone 15 / 128 GB).
//
//   List_c(m)  = Base(m) × (1 + RMA_c + Extra_c)       Floor_c(m) = Base(m) × (1 + RMA_c)
//
// Extra_c (Gabriel, Nov 2 2026): 1.0 % by default; from the client's 2nd order the engine SUGGESTS the SOP score
// and the admin decides. A signal without data yet (e.g. no order priced from a system list) gives 0 points.

export type EngineParams = {
  rmaFloor: number; rmaDefault: number; rmaCap: number;   // %
  extraStep: number; extraMax: number; extraDefault: number; combinedMax: number; // %
};
export const DEFAULT_PARAMS: EngineParams = { rmaFloor: 0.5, rmaDefault: 1.0, rmaCap: 1.5, extraStep: 0.5, extraMax: 2.0, extraDefault: 1.0, combinedMax: 3.5 };

export type RecentOrder = {
  number: string; order_date: string;
  invoiced_on_list: number | null; list_value: number | null;  // Σ qty × unit price / Σ qty × list price, lines priced from a list
  ready_on: string | null; balance_on: string | null;           // status Ready to ship / balance payment confirmed
};
export type EngineInputs = {
  window_from: string; window_days: number; window_orders: number; unit_return_cost_usd: number;
  orders_invoiced: number; orders_closed: number; invoiced_usd: number; credits_usd: number; units_returned: number;
  recent_orders: RecentOrder[]; units_3_months: number;
};

export type RmaDecision = { value: number; case: "default" | "floor" | "ratio" | "cap"; ratio: number | null; cost: number; lines: string[] };
export type Signal = { key: "R" | "V" | "D"; label: string; value: number | null; points: number; text: string };
export type ExtraDecision = { value: number; case: "default" | "engine"; score: number | null; signals: Signal[]; lines: string[] };

const usd = (n: number) => `US$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (n: number, d = 2) => `${n.toFixed(d)} %`;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** SOP 5.2 — check the two-orders rule first, then floor / ratio / cap. */
export function rmaDecision(i: EngineInputs, p: EngineParams = DEFAULT_PARAMS): RmaDecision {
  const credits = Number(i.credits_usd) || 0;
  const returned = Number(i.units_returned) || 0;
  const cost = Math.round((credits + returned * i.unit_return_cost_usd) * 100) / 100;
  const invoiced = Number(i.invoiced_usd) || 0;
  const costText = `RMA cost ${usd(cost)} (credits ${usd(credits)} + ${returned} unit${returned === 1 ? "" : "s"} returned to HK × ${usd(i.unit_return_cost_usd)})`;
  const windowText = `Window: since ${i.window_from} (last ${i.window_days} days, or the last ${i.window_orders} orders if they go further back).`;
  if (i.orders_closed < 2) {
    return { value: p.rmaDefault, case: "default", ratio: null, cost, lines: [
      `${i.orders_closed} closed order${i.orders_closed === 1 ? "" : "s"} (fewer than 2): new client → default ${pct(p.rmaDefault)}. The ratio is not used.`,
      windowText,
    ] };
  }
  const ratio = invoiced > 0 ? (cost / invoiced) * 100 : 0;
  const base = `${costText} ÷ invoiced ${usd(invoiced)} = ${pct(ratio)}.`;
  if (ratio < p.rmaFloor) return { value: p.rmaFloor, case: "floor", ratio, cost, lines: [base, `Below the ${pct(p.rmaFloor)} floor → ${pct(p.rmaFloor)}: a clean window never prices below the floor.`, windowText] };
  if (ratio > p.rmaCap) return { value: p.rmaCap, case: "cap", ratio, cost, lines: [base, `Above the ${pct(p.rmaCap)} cap → ${pct(p.rmaCap)}. At the cap two refreshes in a row: tell the Sales Director.`, windowText] };
  return { value: round3(ratio), case: "ratio", ratio, cost, lines: [base, `Between ${pct(p.rmaFloor)} and ${pct(p.rmaCap)} → the ratio as it is: the account pays what it costs us.`, windowText] };
}

/** Working days (Mon–Fri) after `from` up to and including `to`. */
export function workingDays(from: string, to: string) {
  const a = new Date(`${from}T00:00:00Z`); const b = new Date(`${to}T00:00:00Z`);
  if (!(b > a)) return 0;
  let n = 0;
  for (const d = new Date(a); d < b;) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

/** SOP 5.3 signals (null value = no data yet → 0 points). */
export function signals(i: EngineInputs): Signal[] {
  const last3 = i.recent_orders.slice(0, 3);
  const priced = last3.filter((o) => (Number(o.list_value) || 0) > 0);
  const R = priced.length ? priced.reduce((s, o) => s + Number(o.invoiced_on_list) / Number(o.list_value), 0) / priced.length : null;
  const rPts = R === null ? 0 : R >= 0.98 ? 2 : R >= 0.95 ? 1 : 0;
  const V = (Number(i.units_3_months) || 0) / 3;
  const vPts = V < 400 ? 1 : V < 1000 ? 0 : -1;
  const timed = last3.filter((o) => o.ready_on && o.balance_on);
  const D = timed.length ? timed.reduce((s, o) => s + workingDays(o.ready_on!, o.balance_on!), 0) / timed.length : null;
  const dPts = D === null ? 0 : D <= 3 ? 1 : D > 10 ? -1 : 0;
  return [
    { key: "R", label: "Realization (paid ÷ list, last 3 orders)", value: R, points: rPts,
      text: R === null ? "No data yet: no recent order priced from a system list → 0" : `${R.toFixed(3)} over ${priced.length} order${priced.length === 1 ? "" : "s"} → ${rPts >= 0 ? "+" : ""}${rPts} (≥ 0.98 +2 · 0.95–0.98 +1 · below 0)` },
    { key: "V", label: "Volume (units / month, last 3 months)", value: V, points: vPts,
      text: `${Math.round(V)} units/month → ${vPts >= 0 ? "+" : ""}${vPts} (< 400 +1 · 400–999 0 · ≥ 1,000 −1)` },
    { key: "D", label: "Payment discipline (working days ready → balance)", value: D, points: dPts,
      text: D === null ? "No data yet: no recent order with Ready to ship and a confirmed balance → 0" : `${D.toFixed(1)} working days → ${dPts >= 0 ? "+" : ""}${dPts} (≤ 3 +1 · > 10 −1 · otherwise 0)` },
  ];
}

/** SOP 5.3 + Gabriel's rule: default until the 2nd order, then the suggestion. */
export function extraDecision(i: EngineInputs, p: EngineParams = DEFAULT_PARAMS): ExtraDecision {
  const sig = signals(i);
  if (i.orders_invoiced < 2) {
    return { value: p.extraDefault, case: "default", score: null, signals: sig, lines: [
      `${i.orders_invoiced} order${i.orders_invoiced === 1 ? "" : "s"} so far: default ${pct(p.extraDefault)} until the 2nd order (Gabriel, Nov 2026).`,
    ] };
  }
  const raw = sig.reduce((s, x) => s + x.points, 0);
  const score = Math.max(0, raw);
  const value = Math.min(p.extraMax, round3(score * p.extraStep));
  return { value, case: "engine", score, signals: sig, lines: [
    `Score ${raw}${raw < 0 ? " → minimum 0" : ""} × ${pct(p.extraStep)} = ${pct(score * p.extraStep)}${score * p.extraStep > p.extraMax ? ` → maximum ${pct(p.extraMax)}` : ""} → suggested ${pct(value)}.`,
  ] };
}

/** Combined limit: RMA_c first; Extra_c is trimmed so RMA_c + Extra_c ≤ combined max. */
export function applyCombined(rma: number, extra: number, p: EngineParams = DEFAULT_PARAMS) {
  return { rma, extra: Math.max(0, Math.min(extra, round3(p.combinedMax - rma))) };
}

/** Base × (1 + pct %), rounded to the cent (half up), in integer cents to avoid float drift. */
export function priceWith(base: number, pctTotal: number) {
  const cents = Math.round(base * 100);
  const t = Math.round(pctTotal * 1000); // thousandths of a percent
  return Math.round((cents * (100000 + t)) / 100000) / 100;
}

export function clientPrices(base: number, rma: number, extra: number) {
  return { list: priceWith(base, rma + extra), floor: priceWith(base, rma) };
}

/** Engine parameters from the settings rows (category engine). */
export function paramsFromSettings(rows: { key: string; value: unknown }[]): EngineParams {
  const v = (k: string, d: number) => { const r = rows.find((x) => x.key === k); const n = Number(r?.value); return Number.isFinite(n) ? n : d; };
  return {
    rmaFloor: v("engine_rma_floor_pct", 0.5), rmaDefault: v("engine_rma_default_pct", 1.0), rmaCap: v("engine_rma_cap_pct", 1.5),
    extraStep: v("engine_extra_step_pct", 0.5), extraMax: v("engine_extra_max_pct", 2.0), extraDefault: 1.0,
    combinedMax: v("engine_combined_max_pct", 3.5),
  };
}
