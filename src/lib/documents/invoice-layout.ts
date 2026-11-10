// The commercial invoice EXACTLY in the design of HKR's original Excel invoice (Gabriel, Nov 3 2026: "tal cual es").
// invoice-template.json holds the original's grid (column widths, row heights, merges, fonts, borders, grey fills, number
// formats and the fixed labels) extracted from the reference file — no client or issuer data (public repo).
// This module fills that grid with an invoice and returns a sheet model; the xlsx writer and the PDF renderer both draw
// that same model, so the two files look the same. Pure and unit-tested.
import TPL from "./invoice-template.json";

export type Font = { name: string; size: number; bold: boolean; italic: boolean };
export type Cell = {
  v?: string | number | Date | null; font?: Font; h?: "left" | "center" | "right" | null; wrap?: boolean;
  border?: string; fill?: string; numFmt?: string;
};
export type Sheet = {
  cols: number[];                 // widths (Excel units) of columns A..AA
  rows: number[];                 // heights (points) of rows 1..n
  cells: Map<string, Cell>;       // "B8" → cell
  merges: string[];               // "B8:K8"
  stamp: { fromCol: number; fromRow: number; toCol: number; toRow: number } | null; // 0-based anchor, like Excel
};
export type LayoutLine = { kind: string; description: string; qty: number | null; unit_price: number | null; total: number };
export type LayoutInput = {
  title: string; number: string; exportReference?: string;
  exporter: string[];              // company first, then address lines (phone included)
  consignee: string[]; shipTo: string[];
  date: string;                    // invoice date yyyy-mm-dd (T12)
  notify: { contact?: string; email?: string; address?: string; phone?: string };
  shipment: { reference?: string; awb?: string; country?: string; airport?: string };
  freight: string; paymentTerms: string; via: string; from: string; packages: string; netKg: string; grossKg: string;
  madeIn: string; lines: LayoutLine[]; payment: string[]; total: number;
  notes?: string[]; footer?: string;
  signerName: string; signerTitle: string; company: string; voice: string; whatsapp: string; orderDate: string;
  stamp: boolean;
};

type Spec = { v?: string | number; b?: string; f?: [string, number, string]; a?: [string | null, string | null, boolean]; n?: string; fill?: string };
const T = TPL as unknown as { cols: Record<string, number>; rows: Record<string, number>; merges: string[]; cells: Record<string, Spec>; stamp: { from: [number, number]; to: [number, number] } };

export const COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA"];
const split = (a: string) => { const m = /^([A-Z]+)(\d+)$/.exec(a)!; return { col: m[1], row: Number(m[2]) }; };
const HEADER_END = 23;      // rows 1–23 are copied as they are (23 = the thin row under the column titles)
const LINE_FIRST = 24;      // the original has 9 line rows (24–32); more lines push the footer down
const LINE_ROWS = 9;
const FOOTER_FIRST = 33;    // "Total C.F.R." … the last row (43)
const LAST = 43;

function toCell(s: Spec | undefined): Cell {
  if (!s) return {};
  const f = s.f ? { name: s.f[0], size: Number(s.f[1]), bold: s.f[2].includes("B"), italic: s.f[2].includes("I") } : undefined;
  return { v: s.v ?? null, font: f, h: (s.a?.[0] ?? null) as Cell["h"], wrap: s.a?.[2] ?? false, border: s.b, fill: s.fill, numFmt: s.n };
}
const shift = (range: string, by: number) => range.replace(/(\d+)/g, (d) => String(Number(d) + by));

/** Courier New 9 pt in the description column (D:P): about 57 characters per printed line. */
export function descriptionRows(text: string, perLine = 57) {
  return text.split("\n").reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
}
const lineHeight = (text: string) => Math.max(19.5, descriptionRows(text) * 11 + 11); // original: 1 line ≈ 20, 2 lines 33
const fmtLongDate = (d: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
  .format(new Date(`${d.slice(0, 10)}T00:00:00Z`));

/** yyyy-mm-dd → mm-dd-yyyy (the US order HKR's invoices use). */
export const usDate = (d: string) => { const [y, m, dd] = d.slice(0, 10).split("-"); return `${m}-${dd}-${y}`; };

/** The notify party rows: only what is there (Gabriel, Nov 9 2026: "Contact" = name, email and phone; empty lines are not printed). */
export function notifyItems(n: LayoutInput["notify"]): [string, string][] {
  const items: [string, string | undefined][] = [["Contact:", n.contact], ["Email:", n.email], ["Address:", n.address], ["Phone:", n.phone]];
  return items.filter((x): x is [string, string] => Boolean(x[1]?.trim())).slice(0, 3);
}

export function buildInvoiceSheet(i: LayoutInput): Sheet {
  const cells = new Map<string, Cell>();
  const merges: string[] = [];
  const rows: number[] = [];
  // address block (rows 8–11 of the original): as many rows as the longest of consignee / ship to, at least the original 4
  // (Nov 9 2026: every line its own row — name, address, country, RSIN, EORI, KVK/CoC, VAT — and nothing empty)
  const consignee = i.consignee.filter((x) => x.trim()), shipTo = i.shipTo.filter((x) => x.trim());
  const extra = Math.max(4, consignee.length, shipTo.length) - 4;
  // line area: one row per line, a blank row, the payment lines; at least the original 9 rows
  const area = i.lines.length + (i.payment.length ? 1 + i.payment.length : 0);
  const lineRows = Math.max(LINE_ROWS, area);
  const delta = lineRows - LINE_ROWS;
  // original row → row of this sheet
  const at = (row: number) => (row <= 10 ? row : row < FOOTER_FIRST ? row + extra : row + extra + delta);

  // 1. header (rows 1–23) and footer (rows 33–43) straight from the original; rows 11+ move down by the extra address rows
  for (const [addr, s] of Object.entries(T.cells)) {
    const { col, row } = split(addr);
    if (row <= HEADER_END || row >= FOOTER_FIRST) cells.set(`${col}${at(row)}`, toCell(s));
  }
  for (const m of T.merges) {
    const top = split(m.split(":")[0]).row;
    if (top <= HEADER_END || top >= FOOTER_FIRST) merges.push(shift(m, at(top) - top));
  }
  for (let r = 1; r <= HEADER_END; r++) rows[at(r) - 1] = T.rows[String(r)] ?? 15;
  for (let r = FOOTER_FIRST; r <= LAST; r++) rows[at(r) - 1] = T.rows[String(r)] ?? 15;
  // the extra address rows look like the original's row 10 (a middle address row)
  for (let k = 0; k < extra; k++) {
    const r = 11 + k;
    for (const col of COLS) { const s = T.cells[`${col}10`]; if (s) cells.set(`${col}${r}`, toCell(s)); }
    merges.push(`B${r}:K${r}`, `L${r}:S${r}`, `T${r}:AA${r}`);
    rows[r - 1] = T.rows["10"] ?? 15;
  }

  // 2. line rows in the style of the original's line rows (24 = filled line, 30 = empty line, 31 = payment line)
  const first = LINE_FIRST + extra;
  const style = (from: number, col: string) => toCell(T.cells[`${col}${from}`]);
  for (let k = 0; k < lineRows; k++) {
    const r = first + k;
    for (const col of COLS.slice(1)) cells.set(`${col}${r}`, { ...style(30, col), v: null });
    merges.push(`B${r}:C${r}`, `D${r}:P${r}`, `Q${r}:R${r}`, `S${r}:U${r}`, `V${r}:X${r}`, `Y${r}:AA${r}`);
    rows[r - 1] = 15;
  }
  let n = 0;
  i.lines.forEach((l, k) => {
    const r = first + k;
    const isProduct = l.kind === "product";
    const put = (col: string, v: Cell["v"]) => cells.set(`${col}${r}`, { ...style(24, col), v });
    put("B", isProduct ? ++n : null);
    put("D", l.description);
    put("Q", isProduct ? i.madeIn : null);
    put("S", l.qty);
    put("V", l.unit_price);
    put("Y", l.total);
    rows[r - 1] = lineHeight(l.description);
  });
  i.payment.forEach((p, k) => {
    const r = first + i.lines.length + 1 + k;
    cells.set(`D${r}`, { ...style(31, "D"), v: p });
  });

  // 3. the data of the header and footer cells (addresses of the ORIGINAL grid; at() moves them)
  const set = (addr: string, v: Cell["v"]) => { const a = /^([A-Z]+)(\d+)$/.exec(addr)!; const key = `${a[1]}${at(Number(a[2]))}`; cells.set(key, { ...(cells.get(key) ?? {}), v }); };
  const put = (key: string, v: Cell["v"]) => cells.set(key, { ...(cells.get(key) ?? {}), v });
  set("B1", i.title);
  if (i.exportReference) set("B5", i.exportReference);
  set("V5", `Invoice No: ${i.number}`);
  const exp = [...i.exporter];
  [exp[0], exp[1], exp[2], exp.slice(3).join(" ")].forEach((v, k) => put(`B${8 + k}`, v ?? ""));
  consignee.forEach((v, k) => put(`L${8 + k}`, v));
  shipTo.forEach((v, k) => put(`T${8 + k}`, v));
  set("T12", `Invoice Date: ${usDate(i.date)}`);   // Gabriel, Nov 4 2026: "Invoice Date: 11-04-2026"
  // notify party: Contact / Email / Phone in the original's three label rows (13, 14, 16), only the ones given
  const notify = notifyItems(i.notify);
  [13, 14, 16].forEach((row, k) => { set(`L${row}`, notify[k]?.[0] ?? ""); set(`N${row}`, notify[k]?.[1] ?? ""); });
  set("T13", `Shippment Reference: ${i.shipment.reference || "N/A"}`);
  set("T14", `Air Way Bill Number: ${i.shipment.awb || "N/A"}`);
  set("T15", `Country of consignation: ${i.shipment.country ?? ""}`);
  set("T16", `Airport of Consignation: ${i.shipment.airport ?? ""}`);
  set("Z17", i.packages); set("Z18", i.netKg); set("Z19", i.grossKg);
  set("D18", i.freight); set("E19", i.paymentTerms); set("N18", i.via); set("N19", i.from);
  set("Y33", i.total);
  if (i.notes?.[0]) set("B35", i.notes[0]);
  if (i.notes?.[1]) set("B36", i.notes[1]);
  set("O38", i.company);
  set("B40", i.signerName);
  set("B42", i.signerTitle);
  set("O40", i.voice ? `Voice:${i.voice}` : "");
  set("U40", i.whatsapp ? `Whatsapp:${i.whatsapp}` : "");
  set("O42", fmtLongDate(i.orderDate));
  if (i.footer) set("B43", i.footer);

  const st = T.stamp;
  return {
    cols: COLS.map((c) => T.cols[c] ?? 9.14),
    rows, cells, merges,
    stamp: i.stamp && st ? { fromCol: st.from[0], fromRow: st.from[1] + extra + delta, toCol: st.to[0], toRow: st.to[1] + extra + delta } : null,
  };
}

/** Excel column width → points (Calibri 11 default font: 7 px per character + 5 px padding; 0.75 pt per px). */
export const colPoints = (w: number) => Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7) * 0.75;
export const colIndex = (col: string) => COLS.indexOf(col);
