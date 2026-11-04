// Price list outputs on demand (brief Phase 6 item 6): Excel in the iPhonePrices format, plain text and
// WhatsApp text (bold model headers, one line per SKU, no emoji). The PDF is in outputs-pdf.tsx.
// Client outputs carry the list price only — never the floor or the percentages (SOP 5.5).
import { compareRows, rowLabel } from "./models";

export type OutRow = { model: string; storage_gb: number; note: string | null; price_usd: number };
export type OutMeta = { title: string; validFrom: string; validUntil: string | null; isBase: boolean };

export const money2 = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDate = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Rows grouped by model (with its note), models in catalogue order. */
export function groupRows(rows: OutRow[]) {
  const sorted = [...rows].sort(compareRows);
  const groups: { label: string; rows: OutRow[] }[] = [];
  for (const r of sorted) {
    const label = rowLabel(r);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(r); else groups.push({ label, rows: [r] });
  }
  return groups;
}

function validity(m: OutMeta) {
  return m.validUntil ? `Valid ${fmtDate(m.validFrom)} – ${fmtDate(m.validUntil)}` : `Date ${fmtDate(m.validFrom)}`;
}

export function toPlainText(rows: OutRow[], m: OutMeta) {
  const lines = [m.title, `${validity(m)} · Grade A+++ · USD · FOB Hong Kong`, ""];
  for (const g of groupRows(rows)) {
    lines.push(g.label);
    for (const r of g.rows) lines.push(`  ${r.storage_gb}GB  ${money2(r.price_usd)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function toWhatsApp(rows: OutRow[], m: OutMeta) {
  const lines = [`*${m.title}*`, `${validity(m)} · Grade A+++ · USD · FOB Hong Kong`, ""];
  for (const g of groupRows(rows)) {
    lines.push(`*${g.label}*`);
    for (const r of g.rows) lines.push(`${r.storage_gb}GB — ${money2(r.price_usd)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** Excel in the layout of iPhonePrices_102426.xlsx: green header '"NEW" grade A+++' · GB · USD. */
export async function toXlsx(rows: OutRow[], m: OutMeta): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "HK Refurbished Stock";
  const ws = wb.addWorksheet("Sheet1");
  ws.columns = [{ width: 38 }, { width: 8 }, { width: 12 }];
  const head = ws.addRow(['"NEW" grade A+++', "GB", "USD"]);
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } }; c.font = { bold: true }; });
  for (const r of [...rows].sort(compareRows)) {
    const row = ws.addRow([rowLabel(r), r.storage_gb, Number(r.price_usd)]);
    row.getCell(3).numFmt = "$#,##0.00";
  }
  ws.addRow([]);
  ws.addRow([`${m.title} · ${validity(m)}`]).getCell(1).font = { italic: true, color: { argb: "FF555555" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** SOP P7 file name: [code]_PL_yyyy-mm-dd (base list: BASE_PL_…); Samsung lists: [code]_PL-SAMSUNG_yyyy-mm-dd. */
export const listFileBase = (code: string | null, validFrom: string, brand: string = "iphone") =>
  `${code ?? "BASE"}_PL${brand === "samsung" ? "-SAMSUNG" : ""}_${validFrom}`;
