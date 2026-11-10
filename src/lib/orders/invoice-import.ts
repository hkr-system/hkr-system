// Import an HKR invoice made in Excel (Gabriel, Nov 9 2026): "subo el invoice en excel… y la aplicación registra la venta".
// The old invoices are the same template but rows move (more header lines, more products), so everything is found by its
// LABEL ("Invoice No:", "Ultimate Consignee…", "Line #", "Total C.F.R."), never by a fixed cell. Pure and unit-tested;
// the server reads the .xlsx into a grid of plain values (formula results already resolved) and calls readInvoiceGrid().
import { findModel } from "./magic";
import { batteryLineEligible, matchColor, simChoice, type BatteryOption, type ColorSplit } from "./colors";
import { orderTotals, type CalcInput } from "./calc";
import { optionsApply } from "@/lib/brands";

export type CellValue = string | number | Date | null;
export type Grid = Record<string, CellValue>;        // "D28" → value

export type ImportedProduct = {
  description: string; model: string; storage_gb: number | null; qty: number; unit: number;
  sim: "" | "esim"; ce: boolean; battery: BatteryOption | ""; mixed: boolean; colors: ColorSplit; problems: string[];
};
export type ImportedRow = { description: string; qty: number | null; unit: number | null; amount: number };
export type ImportedInvoice = {
  number: string | null; invoiceDate: string | null; orderDate: string | null;
  consignee: string[]; shipTo: string[]; notify: { contact: string; email: string; phone: string };
  products: ImportedProduct[];
  battery: ImportedRow | null; freight: ImportedRow | null; customs: ImportedRow | null;
  usdtFee: (ImportedRow & { pct: number | null }) | null; others: ImportedRow[];
  total: number; problems: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const COLS = (s: string) => s.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const at = (addr: string) => { const m = /^([A-Z]+)(\d+)$/.exec(addr)!; return { col: COLS(m[1]), row: Number(m[2]) }; };
const letter = (n: number): string => (n > 26 ? letter(Math.floor((n - 1) / 26)) : "") + String.fromCharCode(65 + ((n - 1) % 26));
const text = (v: CellValue | undefined) => (v === null || v === undefined ? "" : v instanceof Date ? "" : String(v)).trim();
const asNum = (v: CellValue | undefined) => (typeof v === "number" ? v : typeof v === "string" && /^-?[\d.,]+$/.test(v.trim()) ? Number(v.replace(/,/g, "")) : null);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "10232026", "10232026-1", "Invoice Date: 10-23-2026" → 2026-10-23 (HKR writes dates month first). */
function usDate(s: string): string | null {
  const m = /(\d{2})[-/.]?(\d{2})[-/.]?(20\d{2})/.exec(s);
  if (!m) return null;
  const [mm, dd, yy] = [Number(m[1]), Number(m[2]), m[3]];
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 ? `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` : null;
}

/** One product description: "iPhone 14 / 128 GB / Physical SIM + eSIM / CE Marked / 80%+ BH / A+++ / Colors: Black(400)". */
export function readDescription(description: string, qty: number, unit: number): ImportedProduct | null {
  const s = ` ${description.toLowerCase().replace(/\s+/g, " ")} `;
  const found = findModel(s);
  if (!found) return null;
  const model = found.model;
  const problems: string[] = [];
  const rest = s.slice(0, found.at) + " " + s.slice(found.at + found.len);
  const gb = /\b1\s*tb\b/.test(rest) ? 1024 : Number(/\b(64|128|256|512)\s*(gb|g)\b/.exec(rest)?.[1] ?? /\b(64|128|256|512)\b/.exec(rest)?.[1] ?? 0) || null;
  if (!gb) problems.push("Storage (GB) not found.");
  const options = optionsApply(model);
  const sim = /e-?sim only|only e-?sim/.test(rest) && simChoice(model) ? "esim" as const : "" as const;
  const ce = options && /\bce\b|ce mark|\bukca\b/.test(rest);
  let battery: BatteryOption | "" = "";
  const bh = /(\d{2})\s*%\s*\+?\s*(bh|battery)/.exec(rest);
  if (!options) battery = "";
  else if (/new batt|0 cycle/.test(rest)) battery = "new";
  else if (/boost/.test(rest) && bh?.[1] === "85") battery = "bh85_boosted";
  else if (/boost/.test(rest)) battery = "boosted100";
  else if (bh?.[1] === "80") battery = "bh80";
  else if (bh) problems.push(`“${bh[1]}%+ BH” is not one of the battery options: none set on the line (the Excel keeps its text).`);
  // colours: "Colors: White(10), Natural(10)" or Mixed
  const colors: ColorSplit = [];
  let mixed = true;
  const list = /colou?rs?\s*:\s*(.+)$/i.exec(description)?.[1];
  if (list) {
    const parts = [...list.matchAll(/([A-Za-z][A-Za-z ]*?)\s*\(\s*(\d+)\s*\)/g)];
    for (const [, name, n] of parts) {
      const c = matchColor(model, name);
      if (c) colors.push({ color: c.name, qty: Number(n) }); else problems.push(`“${name.trim()}” is not a colour of the ${model}.`);
    }
    const sum = colors.reduce((t, c) => t + c.qty, 0);
    if (colors.length && sum === qty && colors.length === parts.length) mixed = false;
    else if (colors.length) { problems.push(`Colours add up to ${sum}, the line says ${qty}: set to Mixed (the Excel keeps “${list.trim()}”).`); colors.length = 0; }
  } else if (!/\bmix/.test(rest)) {
    problems.push("No colours on the line: set to Mixed.");
  }
  return { description, model, storage_gb: gb, qty, unit, sim, ce, battery, mixed, colors: mixed ? [] : colors, problems };
}

export function readInvoiceGrid(g: Grid): ImportedInvoice {
  const cells = Object.entries(g).filter(([, v]) => v !== null && v !== "").map(([a, v]) => ({ ...at(a), v }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const find = (re: RegExp, from = 0) => cells.find((c) => c.row >= from && typeof c.v === "string" && re.test(c.v.trim()));
  const get = (col: number, row: number) => g[`${letter(col)}${row}`] ?? null;
  const problems: string[] = [];

  const numCell = find(/^invoice no/i);
  const number = numCell ? text(numCell.v).replace(/^invoice no\.?\s*:?\s*/i, "").trim() || null : null;

  const cons = find(/^ultimate consignee/i), ship = find(/^ship to/i), notify = find(/^notify party/i);
  const transport = find(/^transportation/i) ?? find(/^condition of sale/i);
  const block = (label: typeof cons, untilRow: number, untilCol: number) => {
    if (!label) return [];
    const out: string[] = [];
    for (let r = label.row + 1; r < untilRow; r++) {
      const v = cells.filter((c) => c.row === r && c.col >= label.col && c.col < untilCol && typeof c.v === "string").map((c) => text(c.v)).filter(Boolean);
      if (v.length) out.push(v.join(" "));
    }
    return out;
  };
  const endRow = notify?.row ?? (cons ? cons.row + 5 : 0);
  const consignee = block(cons, endRow, ship?.col ?? 99);
  const shipTo = block(ship, endRow, 99);

  // notify party: "Contact:", "email:", "Phone:", "Address:" with the value to their right (before the Ship-to column)
  const notifyOut = { contact: "", email: "", phone: "" };
  if (notify) {
    for (const c of cells.filter((x) => x.row > notify.row && x.row < (transport?.row ?? notify.row + 6) && x.col === notify.col)) {
      const label = text(c.v).toLowerCase();
      const value = cells.filter((x) => x.row === c.row && x.col > c.col && x.col < (ship?.col ?? 99)).map((x) => text(x.v)).filter(Boolean).join(" ");
      if (!value) continue;
      if (label.startsWith("contact")) notifyOut.contact = value;
      else if (label.startsWith("email") || label.startsWith("e-mail")) notifyOut.email = value;
      else if (label.startsWith("phone") || label.startsWith("tel")) notifyOut.phone = value;
      else if (label.startsWith("address") && !notifyOut.email && value.includes("@")) notifyOut.email = value;
    }
  }

  // dates: the Ship-to column at the notify row ("Invoice Date: 10-23-2026" or a date), else the invoice number
  const dateCell = ship && notify ? get(ship.col, notify.row) : null;
  const invoiceDate = dateCell instanceof Date ? iso(dateCell) : usDate(text(dateCell)) ?? (number ? usDate(number) : null);
  const ordLabel = find(/^date of order/i);
  const ordCell = ordLabel ? get(ordLabel.col, ordLabel.row + 1) : null;
  const orderDate = ordCell instanceof Date ? iso(ordCell) : usDate(text(ordCell)) ?? invoiceDate;

  // the line table
  const head = find(/^line\s*#/i);
  const colOf = (re: RegExp, fallback: number) => cells.find((c) => c.row === head?.row && typeof c.v === "string" && re.test(c.v))?.col ?? fallback;
  const dCol = colOf(/description|harmonized/i, 4), qCol = colOf(/^quantity/i, 19), pCol = colOf(/price/i, 22), tCol = colOf(/^total price/i, 25);
  const totalLabel = head ? find(/^total c\.?f\.?r/i, head.row) : undefined;
  const products: ImportedProduct[] = []; const others: ImportedRow[] = [];
  let battery: ImportedRow | null = null, freight: ImportedRow | null = null, customs: ImportedRow | null = null;
  let usdtFee: ImportedInvoice["usdtFee"] = null;
  let linesSum = 0;
  if (!head || !totalLabel) problems.push("This does not look like an HKR invoice: “Line #” or “Total C.F.R.” not found.");
  for (let r = (head?.row ?? 0) + 1; head && totalLabel && r < totalLabel.row; r++) {
    const description = text(get(dCol, r)).replace(/\s+/g, " ");
    const qty = asNum(get(qCol, r)), unit = asNum(get(pCol, r));
    let amount = asNum(get(tCol, r));
    if (amount === null && qty !== null && unit !== null) amount = r2(qty * unit);
    if (amount === null) continue;                     // bank / wallet text, empty rows
    amount = r2(amount);
    linesSum = r2(linesSum + amount);
    const row: ImportedRow = { description: description || "(no description)", qty, unit, amount };
    const product = qty !== null && unit !== null ? readDescription(description, qty, unit) : null;
    if (product) products.push(product);
    else if (/new batter/i.test(description)) battery = row;
    else if (/^shipping|^freight/i.test(description)) freight = row;
    else if (/customs/i.test(description)) customs = row;
    else if (/usdt/i.test(description)) usdtFee = { ...row, pct: Number(/(\d+(?:\.\d+)?)\s*%/.exec(description)?.[1] ?? NaN) || null };
    else others.push(row);
  }
  const totalCell = totalLabel ? asNum(get(tCol, totalLabel.row)) : null;
  const total = totalCell !== null ? r2(totalCell) : linesSum;
  if (totalCell !== null && Math.abs(totalCell - linesSum) > 0.01) problems.push(`The Excel total (${totalCell.toFixed(2)}) is not the sum of its lines (${linesSum.toFixed(2)}).`);
  if (!products.length && head) problems.push("No product line found (model + GB + quantity + price).");
  if (!number) problems.push("“Invoice No:” not found.");
  return { number, invoiceDate, orderDate, consignee, shipTo, notify: notifyOut, products, battery, freight, customs, usdtFee, others, total, problems };
}

export type ImportPlan = {
  lines: ImportedProduct[]; batteryLineSeparate: boolean; batteryUnit: number;
  freight: { mode: "unit" | "total"; unit: number | null; total: number };
  customs: { mode: "unit" | "total"; unit: number | null; total: number };
  charges: { description: string; qty: number | null; unit: number | null; amount: number }[];
  paymentMethod: "wire" | "usdt" | "mixed"; ce: boolean; total: number; matches: boolean; notes: string[];
};

/** How the imported invoice becomes an order whose total is EXACTLY the Excel total (checked with the same calculator). */
export function planImport(inv: ImportedInvoice, usdtFeePct: number, depositPct = 10): ImportPlan {
  const notes: string[] = [];
  const pcs = inv.products.reduce((n, p) => n + p.qty, 0);
  const charges: ImportPlan["charges"] = inv.others.map((o) => ({ description: o.description, qty: o.qty, unit: o.unit, amount: o.amount }));
  // "New battery cell": the order's own battery line when it covers exactly the new-battery units the system bills
  // (never iPhone 16); otherwise kept as a charge line with the Excel's quantity and price
  const eligible = inv.products.filter((p) => p.battery === "new" && batteryLineEligible(p.model)).reduce((n, p) => n + p.qty, 0);
  let separate = false, batteryUnit = 0;
  if (inv.battery) {
    if (inv.battery.qty === eligible && inv.battery.unit !== null) { separate = true; batteryUnit = inv.battery.unit; }
    else {
      charges.unshift({ description: inv.battery.description, qty: inv.battery.qty, unit: inv.battery.unit, amount: inv.battery.amount });
      notes.push(`“${inv.battery.description}” bills ${inv.battery.qty ?? "?"} units (the system's battery line would bill ${eligible}): kept as a charge line.`);
    }
  }
  const fee = (row: ImportedRow | null) => !row ? { mode: "total" as const, unit: null, total: 0 }
    : row.qty === pcs && row.unit !== null ? { mode: "unit" as const, unit: row.unit, total: row.amount } : { mode: "total" as const, unit: null, total: row.amount };
  const freight = fee(inv.freight), customs = fee(inv.customs);
  const calc = (method: CalcInput["paymentMethod"], extra: number) => orderTotals({
    lines: inv.products.map((p) => ({ qty: p.qty, unitPrice: p.unit, batteryNew: p.battery === "new", batteryUnit, batteryEligible: batteryLineEligible(p.model) })),
    batteryLineSeparate: separate, freight: freight.total, customs: customs.total, charges: r2(charges.reduce((t, c) => t + c.amount, 0) + extra),
    rmaDiscount: 0, paymentMethod: method, depositPct, usdtFeePct,
  });
  let paymentMethod: ImportPlan["paymentMethod"] = "wire";
  if (inv.usdtFee) {
    if (Math.abs(calc("usdt", 0).usdtFee - inv.usdtFee.amount) <= 0.01) paymentMethod = "usdt";
    else {
      paymentMethod = "mixed";
      charges.push({ description: inv.usdtFee.description, qty: null, unit: null, amount: inv.usdtFee.amount });
      notes.push(`“${inv.usdtFee.description}” is not today's ${usdtFeePct} % fee: kept as a charge line and the payment method set to Mixed (USDT + wire) so no second fee is added.`);
    }
  }
  const total = calc(paymentMethod, 0).total;
  return {
    lines: inv.products, batteryLineSeparate: separate, batteryUnit, freight, customs, charges, paymentMethod,
    ce: inv.products.some((p) => p.ce), total, matches: Math.abs(total - inv.total) <= 0.01, notes,
  };
}
