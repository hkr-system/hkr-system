// Invoice lines built from an order — same wording and order as the reference invoices
// (Commercial Invoice, Ever State): one line per model/storage/price with the colours,
// then "New battery cell", "Customs Clearance", "Shipping HK to <country>", RMA discount, "USDT Fee (x%)".
// Amounts follow public.order_recalc() exactly, so the invoice total equals the order total.

export type InvoiceLineKind = "product" | "battery" | "customs" | "shipping" | "rma" | "usdt" | "other";
export type InvoiceLine = { kind: InvoiceLineKind; description: string; qty: number | null; unit_price: number | null; total: number };

export type SourceLine = {
  qty: number; unitPrice: number; batteryNew: boolean; batteryUnit: number; batteryEligible: boolean;
  model?: string | null; storageGb?: number | null; color?: string | null; grade?: string | null; description?: string | null;
};
export type BuildInput = {
  lines: SourceLine[];
  batteryLineSeparate: boolean;
  ceText: string | null;           // "CE Marked" / "UKCA" when the account's format shows it
  freight: number; customs: number; rmaDiscount: number;
  paymentMethod: "wire" | "usdt";
  usdtFeePct: number;
  shipCountry: string | null;      // country name for "Shipping HK to …"
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function pctLabel(p: number) {
  return `${Number(p.toFixed(2))}%`;
}

/** Fixed costs are shown per unit (qty × unit) when they split exactly, otherwise as one amount. */
function perUnit(total: number, pieces: number): { qty: number | null; unit_price: number | null } {
  if (pieces > 0 && Math.round(total * 100) % pieces === 0) return { qty: pieces, unit_price: r2(total / pieces) };
  return { qty: null, unit_price: null };
}

export function productDescription(l: SourceLine, ceText: string | null, colors: string | null) {
  if (!l.model) return l.description ?? "";
  const eligible = l.batteryEligible !== false;
  return [
    l.model,
    l.storageGb ? `${l.storageGb} GB` : null,
    l.batteryNew && eligible ? "New Battery cell 0 Cycle" : null,
    ceText,
    l.grade || "A+++",
    colors,
  ].filter(Boolean).join(" / ");
}

export function buildInvoiceLines(i: BuildInput): { lines: InvoiceLine[]; total: number; pieces: number } {
  const pieces = i.lines.reduce((s, l) => s + l.qty, 0);

  // products: group by model + storage + grade + battery + unit price (colours listed inside)
  const groups = new Map<string, { first: SourceLine; qty: number; colors: Map<string, number> }>();
  for (const l of i.lines) {
    const key = l.model
      ? [l.model, l.storageGb, l.grade ?? "A+++", l.batteryNew && l.batteryEligible !== false, l.unitPrice].join("|")
      : `free|${l.description}|${l.unitPrice}|${groups.size}`;
    const g = groups.get(key) ?? { first: l, qty: 0, colors: new Map<string, number>() };
    g.qty += l.qty;
    if (l.color) g.colors.set(l.color, (g.colors.get(l.color) ?? 0) + l.qty);
    groups.set(key, g);
  }
  const out: InvoiceLine[] = [];
  for (const g of groups.values()) {
    const colors = g.colors.size ? `Colors: ${[...g.colors].map(([c, n]) => `${c}(${n})`).join(", ")}` : null;
    out.push({ kind: "product", description: productDescription(g.first, i.ceText, colors), qty: g.qty, unit_price: g.first.unitPrice, total: r2(g.qty * g.first.unitPrice) });
  }

  // separate "New battery cell" line (only eligible models, only when the account bills it apart)
  if (i.batteryLineSeparate) {
    const byUnit = new Map<number, number>();
    for (const l of i.lines) if (l.batteryNew && l.batteryEligible !== false && l.batteryUnit > 0) byUnit.set(l.batteryUnit, (byUnit.get(l.batteryUnit) ?? 0) + l.qty);
    for (const [unit, qty] of byUnit) out.push({ kind: "battery", description: "New battery cell", qty, unit_price: unit, total: r2(qty * unit) });
  }
  if (i.customs > 0) out.push({ kind: "customs", description: "Customs Clearance", ...perUnit(i.customs, pieces), total: r2(i.customs) });
  if (i.freight > 0) out.push({ kind: "shipping", description: i.shipCountry ? `Shipping HK to ${i.shipCountry}` : "Shipping", ...perUnit(i.freight, pieces), total: r2(i.freight) });
  if (i.rmaDiscount > 0) out.push({ kind: "rma", description: "RMA discount", qty: null, unit_price: null, total: -r2(i.rmaDiscount) });

  const base = r2(out.reduce((s, l) => s + l.total, 0));
  if (i.paymentMethod === "usdt") {
    const fee = r2((base * i.usdtFeePct) / 100);
    out.push({ kind: "usdt", description: `USDT Fee (${pctLabel(i.usdtFeePct)})`, qty: null, unit_price: null, total: fee });
  }
  return { lines: out, total: r2(out.reduce((s, l) => s + l.total, 0)), pieces };
}

/** Number shown on the document; drafts say so. */
export function invoiceTitle(status: string) {
  return status === "draft" ? "COMMERCIAL INVOICE — DRAFT" : "COMMERCIAL INVOICE";
}

/** SOP file name: [code]_ORD-NN_INV-HK (+ _v2… for later versions). */
export function invoiceFileBase(accountCode: string, orderNumber: string, version: number) {
  return `${accountCode}_${orderNumber}_INV-HK${version > 1 ? `_v${version}` : ""}`;
}
