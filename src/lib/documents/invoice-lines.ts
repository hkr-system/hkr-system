// Invoice lines built from an order — same wording and order as the reference invoices
// (Commercial Invoice, Ever State): one line per model/storage/price with the colours,
// then "New battery cell", "Customs Clearance", "Shipping HK to <country>", RMA discount, "USDT Fee (x%)".
// Amounts follow public.order_recalc() exactly, so the invoice total equals the order total.

export type InvoiceLineKind = "product" | "battery" | "customs" | "shipping" | "rma" | "usdt" | "other";
export type InvoiceLine = { kind: InvoiceLineKind; description: string; qty: number | null; unit_price: number | null; total: number };

export type SourceLine = {
  qty: number; unitPrice: number; batteryNew: boolean; batteryUnit: number; batteryEligible: boolean;
  model?: string | null; storageGb?: number | null; color?: string | null; grade?: string | null; description?: string | null;
  // Nov 2 2026: colours and options per line (undefined on older lines → account-level CE text, SKU colour)
  colorsMixed?: boolean; colorSplit?: { color: string; qty: number }[];
  ce?: boolean; imeiMatching?: boolean; batteryOption?: string | null;
};
export type BuildInput = {
  lines: SourceLine[];
  batteryLineSeparate: boolean;
  ceText: string | null;           // "CE Marked" / "UKCA" when the account's format shows it
  freight: number; customs: number; rmaDiscount: number;
  credits?: { number: string; amount: number }[]; // credit notes applied to the order (Nov 3 2026): one line each
  paymentMethod: "wire" | "usdt";
  usdtFeePct: number;
  shipCountry: string | null;      // country name for "Shipping HK to …"
  plain?: boolean;                 // account wants "Used iPhone 12 128GB" and nothing else (no battery, CE, colours…)
  ceLabel?: string;                // "CE Marked" (or "UKCA" for GB) printed on lines with CE Marks ticked
};

const BATTERY_TEXT: Record<string, string> = {
  new: "New Battery cell 0 Cycle", boosted100: "Battery boosted to 100%", bh85_boosted: "Battery health 85%+ (boosted)", bh80: "Battery health 80%+",
};
const PLAIN_COLOR: Record<string, string> = {};
/** "Midnight/Black" for the invoice (reference format "Black(10)" kept); the plain colour comes from the official list. */
export function colorText(model: string | null | undefined, color: string, plainOf?: (m: string, c: string) => string | null) {
  const plain = plainOf?.(model ?? "", color) ?? PLAIN_COLOR[color];
  return plain && plain.toLowerCase() !== color.toLowerCase() ? `${color}/${plain}` : color;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function pctLabel(p: number) {
  return `${Number(p.toFixed(2))}%`;
}

/** Fixed costs are shown per unit (qty × unit) when they split exactly, otherwise as one amount. */
function perUnit(total: number, pieces: number): { qty: number | null; unit_price: number | null } {
  if (pieces > 0 && Math.round(total * 100) % pieces === 0) return { qty: pieces, unit_price: r2(total / pieces) };
  return { qty: null, unit_price: null };
}

export function productDescription(l: SourceLine, ceText: string | null, colors: string | null, plain = false) {
  if (!l.model) return l.description ?? "";
  if (plain) return `Used ${l.model}${l.storageGb ? ` ${l.storageGb}GB` : ""}`;
  const eligible = l.batteryEligible !== false;
  const option = l.batteryOption === undefined ? (l.batteryNew ? "new" : null) : l.batteryOption;
  return [
    l.model,
    l.storageGb ? `${l.storageGb} GB` : null,
    option && (option !== "new" || eligible) ? BATTERY_TEXT[option] : null,
    ceText,
    l.imeiMatching ? "IMEI matching color" : null,
    l.grade || "A+++",
    colors,
  ].filter(Boolean).join(" / ");
}

export function buildInvoiceLines(i: BuildInput, plainOf?: (model: string, color: string) => string | null): { lines: InvoiceLine[]; total: number; pieces: number } {
  const pieces = i.lines.reduce((s, l) => s + l.qty, 0);

  // products: group by model + storage + grade + battery + unit price (colours listed inside)
  const ceOf = (l: SourceLine) => (l.ce === undefined ? i.ceText : l.ce ? (i.ceLabel ?? i.ceText ?? "CE Marked") : null);
  const groups = new Map<string, { first: SourceLine; qty: number; colors: Map<string, number>; mixed: boolean }>();
  for (const l of i.lines) {
    const opt = l.batteryOption === undefined ? (l.batteryNew && l.batteryEligible !== false ? "new" : "") : l.batteryOption ?? "";
    const key = l.model
      ? [l.model, l.storageGb, l.grade ?? "A+++", opt, ceOf(l) ?? "", l.imeiMatching ? 1 : 0, l.unitPrice].join("|")
      : `free|${l.description}|${l.unitPrice}|${groups.size}`;
    const g = groups.get(key) ?? { first: l, qty: 0, colors: new Map<string, number>(), mixed: false };
    g.qty += l.qty;
    if (l.colorSplit?.length) for (const c of l.colorSplit) g.colors.set(c.color, (g.colors.get(c.color) ?? 0) + c.qty);
    else if (l.color) g.colors.set(l.color, (g.colors.get(l.color) ?? 0) + l.qty);
    else if (l.colorsMixed) g.mixed = true;
    groups.set(key, g);
  }
  const out: InvoiceLine[] = [];
  for (const g of groups.values()) {
    const listed = [...g.colors].map(([c, n]) => `${colorText(g.first.model, c, plainOf)}(${n})`);
    if (g.mixed) listed.push(g.colors.size ? `Mixed(${g.qty - [...g.colors.values()].reduce((a, b) => a + b, 0)})` : "Mixed");
    const colors = listed.length ? `Colors: ${listed.join(", ")}` : null;
    out.push({ kind: "product", description: productDescription(g.first, ceOf(g.first), colors, i.plain), qty: g.qty, unit_price: g.first.unitPrice, total: r2(g.qty * g.first.unitPrice) });
  }

  // separate "New battery cell" line (only eligible models, only when the account bills it apart)
  if (i.batteryLineSeparate) {
    const byUnit = new Map<number, number>();
    for (const l of i.lines) if (l.batteryNew && l.batteryEligible !== false && l.batteryUnit > 0) byUnit.set(l.batteryUnit, (byUnit.get(l.batteryUnit) ?? 0) + l.qty);
    for (const [unit, qty] of byUnit) out.push({ kind: "battery", description: "New battery cell", qty, unit_price: unit, total: r2(qty * unit) });
  }
  if (i.customs > 0) out.push({ kind: "customs", description: "Customs Clearance", ...perUnit(i.customs, pieces), total: r2(i.customs) });
  if (i.freight > 0) out.push({ kind: "shipping", description: i.shipCountry ? `Shipping HK to ${i.shipCountry}` : "Shipping", ...perUnit(i.freight, pieces), total: r2(i.freight) });
  if (i.credits?.length) {
    for (const c of i.credits) out.push({ kind: "rma", description: `Credit note ${c.number}`, qty: null, unit_price: null, total: -r2(c.amount) });
  } else if (i.rmaDiscount > 0) out.push({ kind: "rma", description: "RMA discount", qty: null, unit_price: null, total: -r2(i.rmaDiscount) }); // orders before Nov 3

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
