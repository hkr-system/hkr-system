import "server-only";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { layoutInput, type InvoiceDoc } from "./invoice";
import { buildInvoiceSheet, colPoints, COLS, type Cell, type Sheet } from "./invoice-layout";

// PDF = the original Excel invoice drawn cell by cell from the same grid as the xlsx (invoice-layout.ts):
// same column widths, row heights, merged blocks, thin black borders, grey fills, Times / Courier fonts.
// Excel's fonts map to the PDF standard fonts: Times New Roman → Times, Courier New → Courier, Calibri → Helvetica.

const A4 = { w: 595.28, h: 841.89 };
// the original's page margins (inches → points): printed at 100 %, like the Excel
const MARGIN = { left: 0.4 * 72, right: 0.11 * 72, top: 0.19 * 72, bottom: 0.11 * 72 };
const PAD = 1.6;

function pdfFont(c: Cell) {
  const f = c.font;
  if (!f) return "Helvetica";
  const style = (bold: string, italic: string, both: string, plain: string) => (f.bold && f.italic ? both : f.bold ? bold : f.italic ? italic : plain);
  if (/times/i.test(f.name)) return style("Times-Bold", "Times-Italic", "Times-BoldItalic", "Times-Roman");
  if (/courier/i.test(f.name)) return style("Courier-Bold", "Courier-Oblique", "Courier-BoldOblique", "Courier");
  return style("Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique", "Helvetica");
}
// Calibri is narrower than Helvetica: print it a little smaller so the same text fits the same box
const sizeOf = (c: Cell) => (c.font?.size ?? 10) * (c.font && !/times|courier/i.test(c.font.name) ? 0.88 : 1);
// average character width in em (Courier is exact)
const em = (c: Cell) => (/courier/i.test(c.font?.name ?? "") ? 0.6 : /times/i.test(c.font?.name ?? "") ? 0.47 : 0.5);

function shown(c: Cell): string {
  const v = c.v;
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    if (c.numFmt === "#,##0.00") return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (c.numFmt === "0") return String(Math.round(v));
    return String(v);
  }
  return String(v);
}

type Region = { addr: string; c0: number; r0: number; c1: number; r1: number };
function regions(sheet: Sheet): Region[] {
  const covered = new Set<string>();
  const out: Region[] = [];
  const parse = (a: string) => { const m = /^([A-Z]+)(\d+)$/.exec(a)!; return { c: COLS.indexOf(m[1]), r: Number(m[2]) - 1 }; };
  for (const m of sheet.merges) {
    const [a, b] = m.split(":").map(parse);
    for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) covered.add(`${c}:${r}`);
    out.push({ addr: m.split(":")[0], c0: a.c, r0: a.r, c1: b.c, r1: b.r });
  }
  for (const addr of sheet.cells.keys()) {
    const p = parse(addr);
    if (!covered.has(`${p.c}:${p.r}`)) out.push({ addr, c0: p.c, r0: p.r, c1: p.c, r1: p.r });
  }
  return out;
}

function InvoiceSheet({ sheet, stamp }: { sheet: Sheet; stamp: string | null }) {
  // geometry in points, starting at column B (A is the original's 1-unit spacer)
  const widths = sheet.cols.map(colPoints);
  const xs = [0]; for (let k = 0; k < widths.length; k++) xs.push(xs[k] + widths[k]);
  const ys = [0]; for (let k = 0; k < sheet.rows.length; k++) ys.push(ys[k] + (sheet.rows[k] ?? 15));
  const left = xs[1], right = xs[COLS.length];
  const totalW = right - left, totalH = ys[sheet.rows.length];
  const k = Math.min(1, (A4.w - MARGIN.left - MARGIN.right) / totalW, (A4.h - MARGIN.top - MARGIN.bottom) / totalH);
  const X = (c: number) => MARGIN.left + (xs[c] - left) * k;
  const Y = (r: number) => MARGIN.top + ys[r] * k;
  const regs = regions(sheet);
  const line = 0.5;
  // an edge inside a merged block is not drawn (Excel shows only the outline of the block)
  const regionOf = new Map<string, Region>();
  for (const g of regs) for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) regionOf.set(`${c}:${r}`, g);

  return (
    <View style={{ position: "relative", width: A4.w, height: A4.h }}>
      {/* grey fills */}
      {regs.map((g) => {
        const c = sheet.cells.get(g.addr);
        if (!c?.fill || c.fill === "FFFFFF") return null;
        return <View key={`f${g.addr}`} style={{ position: "absolute", left: X(g.c0), top: Y(g.r0), width: X(g.c1 + 1) - X(g.c0), height: Y(g.r1 + 1) - Y(g.r0), backgroundColor: `#${c.fill}` }} />;
      })}
      {/* borders: every edge of every cell, as in the Excel */}
      {[...sheet.cells.entries()].flatMap(([addr, c]) => {
        if (!c.border) return [];
        const m = /^([A-Z]+)(\d+)$/.exec(addr)!; const col = COLS.indexOf(m[1]); const row = Number(m[2]) - 1;
        const x0 = X(col), x1 = X(col + 1), y0 = Y(row), y1 = Y(row + 1);
        const g = regionOf.get(`${col}:${row}`);
        const inner = { l: g && col > g.c0, r: g && col < g.c1, t: g && row > g.r0, b: g && row < g.r1 };
        const e: { k: string; s: object }[] = [];
        if (c.border.includes("l") && !inner.l) e.push({ k: "l", s: { left: x0 - line / 2, top: y0, width: line, height: y1 - y0 } });
        if (c.border.includes("r") && !inner.r) e.push({ k: "r", s: { left: x1 - line / 2, top: y0, width: line, height: y1 - y0 } });
        if (c.border.includes("t") && !inner.t) e.push({ k: "t", s: { left: x0, top: y0 - line / 2, width: x1 - x0, height: line } });
        if (c.border.includes("b") && !inner.b) e.push({ k: "b", s: { left: x0, top: y1 - line / 2, width: x1 - x0, height: line } });
        return e.map((x) => <View key={`b${addr}${x.k}`} style={{ position: "absolute", backgroundColor: "#000", ...x.s }} />);
      })}
      {/* text */}
      {regs.map((g) => {
        const c = sheet.cells.get(g.addr);
        if (!c) return null;
        const text = shown(c);
        if (!text) return null;
        const isNum = typeof c.v === "number";
        const align = c.h ?? (isNum ? "right" : "left");
        const x0 = X(g.c0), x1 = X(g.c1 + 1);
        // like Excel: text that does not wrap runs on to the right when the next cell is empty;
        // when the next cell has text, the font shrinks so it stays in its own box
        const own = x1 - x0 - 2 * PAD;
        const nextBusy = regs.some((o) => o.r0 === g.r0 && o.c0 === g.c1 + 1 && shown(sheet.cells.get(o.addr) ?? {}) !== "");
        let size = sizeOf(c) * k;
        const boxH = Y(g.r1 + 1) - Y(g.r0);
        const oneLine = boxH < size * 1.15 * 2;   // the box has room for one line only
        if ((!c.wrap && nextBusy) || ((c.wrap || align === "left") && oneLine && text.length * em(c) * size > (nextBusy || c.wrap ? own : X(COLS.length) - x0 - 2 * PAD)))
          size = Math.min(size, (nextBusy || c.wrap ? own : X(COLS.length) - x0 - 2 * PAD) / Math.max(1, text.length * em(c)));
        const width = c.wrap || align !== "left" || nextBusy ? own : X(COLS.length) - x0 - 2 * PAD;
        return (
          <View key={`t${g.addr}`} style={{ position: "absolute", left: x0 + PAD, top: Y(g.r0), width, height: Y(g.r1 + 1) - Y(g.r0), justifyContent: "center" }}>
            <Text style={{ fontFamily: pdfFont(c), fontSize: size, textAlign: align, lineHeight: 1.15 }}>{text}</Text>
          </View>
        );
      })}
      {stamp && sheet.stamp ? (() => {
        const x0 = X(sheet.stamp.fromCol), x1 = X(sheet.stamp.toCol + 1), y0 = Y(sheet.stamp.fromRow + 1), y1 = Y(sheet.stamp.toRow + 1);
        const w = (x1 - x0) * 0.96, h = (y1 - y0) * 0.96;
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt attribute
        return <Image src={stamp} style={{ position: "absolute", left: x0 + (x1 - x0 - w) / 2, top: y0 + (y1 - y0 - h) / 2, width: w, height: h, objectFit: "contain" }} />;
      })() : null}
    </View>
  );
}

export async function invoicePdf(doc: InvoiceDoc): Promise<Buffer> {
  const sheet = buildInvoiceSheet(layoutInput(doc));
  return renderToBuffer(
    <Document title={`Invoice ${doc.number}`} author={doc.issuer.company ?? "HK Refurbished Stock"}>
      <Page size="A4" style={{ padding: 0 }}>
        <InvoiceSheet sheet={sheet} stamp={sheet.stamp ? doc.issuer.stamp ?? null : null} />
      </Page>
    </Document>,
  );
}
