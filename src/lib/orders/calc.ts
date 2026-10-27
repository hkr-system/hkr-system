// Order totals — the same rules as public.order_recalc() in the database (brief §6), used for the
// live preview in the order form. The database is the source of truth when the order is saved.

export type CalcLine = { qty: number; unitPrice: number; batteryNew: boolean; batteryUnit: number; batteryEligible: boolean };
export type CalcInput = {
  lines: CalcLine[];
  batteryLineSeparate: boolean;
  freight: number;
  customs: number;
  rmaDiscount: number;
  paymentMethod: "wire" | "usdt";
  depositPct: number;   // settings.deposit_pct (10)
  usdtFeePct: number;   // settings.usdt_fee_pct (0.85)
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function orderTotals(i: CalcInput) {
  const subtotal = r2(i.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const battery = r2(i.lines.reduce(
    (s, l) => s + (i.batteryLineSeparate && l.batteryNew && l.batteryEligible ? l.qty * l.batteryUnit : 0), 0));
  const pieces = i.lines.reduce((s, l) => s + l.qty, 0);
  const base = r2(subtotal + battery + i.freight + i.customs - i.rmaDiscount);
  const usdtFee = i.paymentMethod === "usdt" ? r2((base * i.usdtFeePct) / 100) : 0;
  const total = r2(base + usdtFee);
  const deposit = r2((total * i.depositPct) / 100);
  return { subtotal, battery, pieces, usdtFee, total, deposit, balance: r2(total - deposit) };
}
