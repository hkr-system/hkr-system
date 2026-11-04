// Order totals — the same rules as public.order_recalc() in the database (brief §6), used for the
// live preview in the order form. The database is the source of truth when the order is saved.

export type CalcLine = { qty: number; unitPrice: number; batteryNew: boolean; batteryUnit: number; batteryEligible: boolean };
export type CalcInput = {
  lines: CalcLine[];
  batteryLineSeparate: boolean;
  freight: number;      // shipping total (per unit: US$/unit × units, worked out by the caller with shippingTotal)
  customs: number;
  charges?: number;     // Σ other charges (+) and discounts (−) of the order (Nov 4 2026)
  rmaDiscount: number;
  paymentMethod: "wire" | "usdt" | "mixed";   // mixed: the USDT fee is paid on each USDT payment, not on the invoice
  depositPct: number;   // settings.deposit_pct (10)
  usdtFeePct: number;   // settings.usdt_fee_pct (0.85)
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function orderTotals(i: CalcInput) {
  const subtotal = r2(i.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const battery = r2(i.lines.reduce(
    (s, l) => s + (i.batteryLineSeparate && l.batteryNew && l.batteryEligible ? l.qty * l.batteryUnit : 0), 0));
  const pieces = i.lines.reduce((s, l) => s + l.qty, 0);
  const base = r2(subtotal + battery + i.freight + i.customs + (i.charges ?? 0) - i.rmaDiscount);
  const usdtFee = i.paymentMethod === "usdt" ? r2((base * i.usdtFeePct) / 100) : 0;
  const total = r2(base + usdtFee);
  const deposit = r2((total * i.depositPct) / 100);
  return { subtotal, battery, pieces, usdtFee, total, deposit, balance: r2(total - deposit) };
}

/** Shipping / customs of an order (Nov 4 2026): per unit = US$/unit × units, or one total for the shipment. */
export function shippingTotal(mode: "unit" | "total", unit: number, total: number, pieces: number) {
  return mode === "unit" ? r2(unit * pieces) : r2(total);
}

/**
 * A USDT payment on a MIXED order (Gabriel, Nov 4 2026): it should bring the part of the invoice it covers + 0.85 %.
 * What is missing of the fee is a financial loss (never asked again); below the part covered it is a normal short payment.
 * Same rule as SQL public.payments_before_usdt().
 */
export function usdtPart(received: number, covers: number, feePct: number) {
  const fee = r2((covers * feePct) / 100);
  const feeGot = Math.min(fee, Math.max(0, r2(received - covers)));
  return { expected: r2(covers + fee), fee, feeLost: r2(fee - feeGot), applied: r2(received - feeGot) };
}
