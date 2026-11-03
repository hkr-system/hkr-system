import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fmtDay, fmtMoney } from "./credit-note";
import { invoiceTitle, type InvoiceLine } from "./invoice-lines";
import { buildInvoiceSheet, colPoints, type LayoutInput } from "./invoice-layout";

// Commercial invoice in the EXACT design of HKR's original Excel invoice (invoice-layout.ts; Gabriel, Nov 3 2026).
// Issuer, bank, USDT wallet and stamp come from Settings → Invoices (setting invoice_issuers), never from the code.

export type InvoiceIssuer = {
  company?: string; address?: string[]; phone?: string; whatsapp?: string;
  signer_name?: string; signer_title?: string;
  bank_lines?: string[]; usdt_lines?: string[];
  stamp?: string;  // data URL (jpeg/png) of the company stamp; printed on approved invoices only
};
export type InvoiceTexts = {
  freight?: string; payment_terms?: string; via?: string; from?: string; made_in?: string;
  packages?: string; net_kg?: string; gross_kg?: string; export_reference?: string; notes?: string[]; footer?: string;
};
export type Notify = { contact?: string; address?: string; phone?: string };
export type Shipment = { country?: string; reference?: string; awb?: string; airport?: string };

export type InvoiceDoc = {
  id: string; number: string; status: string; version: number; date: string; orderDate: string;
  accountCode: string; orderNumber: string;
  issuer: InvoiceIssuer; texts: InvoiceTexts;
  consignee: string[]; shipTo: string[]; notify: Notify; shipment: Shipment;
  lines: InvoiceLine[]; total: number; payment: string[];
};

export const splitLines = (t: string | null | undefined) => (t ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export async function loadInvoiceDoc(db: SupabaseClient<Database>, id: string): Promise<InvoiceDoc | null> {
  const [{ data: inv }, { data: settings }] = await Promise.all([
    db.from("invoices").select("*, accounts(code), orders(number, order_date)").eq("id", id).maybeSingle(),
    db.from("settings").select("key, value").in("key", ["invoice_issuers", "invoice_texts"]),
  ]);
  if (!inv) return null;
  const get = (k: string) => settings?.find((s) => s.key === k)?.value as Record<string, unknown> | undefined;
  const issuer = ((get("invoice_issuers") ?? {})[inv.billing_entity] ?? {}) as InvoiceIssuer;
  const acc = inv.accounts as unknown as { code: string };
  const ord = inv.orders as unknown as { number: string; order_date: string };
  const lines = (inv.lines ?? []) as unknown as InvoiceLine[];
  return {
    id: inv.id, number: inv.number, status: inv.status, version: inv.version, date: inv.invoice_date, orderDate: ord.order_date,
    accountCode: acc.code, orderNumber: ord.number,
    issuer, texts: (get("invoice_texts") ?? {}) as InvoiceTexts,
    consignee: splitLines(inv.consignee), shipTo: splitLines(inv.ship_to),
    notify: (inv.notify ?? {}) as Notify, shipment: (inv.shipment ?? {}) as Shipment,
    lines, total: Number(inv.total_usd),
    payment: (inv.payment_method === "usdt" ? issuer.usdt_lines : issuer.bank_lines) ?? [],
  };
}

export const showStamp = (doc: InvoiceDoc) => Boolean(doc.issuer.stamp) && doc.status !== "draft";

/** Pixel size of a PNG or JPEG (so the stamp keeps its proportions in the xlsx). */
export function imageSize(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]; const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

function dataUrlParts(url: string): { base64: string; ext: "png" | "jpeg" } | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(url);
  return m ? { base64: m[2], ext: m[1] === "png" ? "png" : "jpeg" } : null;
}

/** The invoice data → the original invoice grid (invoice-layout.ts). */
export function layoutInput(doc: InvoiceDoc): LayoutInput {
  const t = doc.texts; const iss = doc.issuer;
  const addr = [...(iss.address ?? [])];
  const exporter = [iss.company ?? "", ...addr];
  if (iss.phone) { if (exporter.length >= 4) exporter[exporter.length - 1] += ` ${iss.phone}`; else exporter.push(iss.phone); }
  return {
    title: invoiceTitle(doc.status), number: doc.number, exportReference: t.export_reference,
    exporter, consignee: doc.consignee, shipTo: doc.shipTo, date: doc.date, notify: doc.notify, shipment: doc.shipment,
    freight: t.freight ?? "FOB HK", paymentTerms: t.payment_terms ?? "Pre-payment", via: t.via ?? "FEDEX/DHL Express",
    from: t.from ?? "Hong Kong", packages: t.packages ?? "1", netKg: t.net_kg ?? "N/A", grossKg: t.gross_kg ?? "N/A",
    madeIn: t.made_in ?? "China", lines: doc.lines, payment: doc.payment, total: doc.total, notes: t.notes, footer: t.footer,
    signerName: iss.signer_name ?? "", signerTitle: iss.signer_title ?? "", company: iss.company ?? "",
    voice: iss.phone ?? "", whatsapp: iss.whatsapp ?? "", orderDate: doc.orderDate, stamp: showStamp(doc),
  };
}

// xlsx: the original grid cell by cell (same widths, heights, merges, fonts, borders, fills and formats).
export async function invoiceXlsx(doc: InvoiceDoc): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const sheet = buildInvoiceSheet(layoutInput(doc));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoice", {
    pageSetup: { paperSize: 9, orientation: "portrait",
      margins: { left: 0.4, right: 0.11, top: 0.19, bottom: 0.11, header: 0, footer: 0 } },
    views: [{ showGridLines: false }],
  });
  sheet.cols.forEach((w, k) => { ws.getColumn(k + 1).width = w; });
  sheet.rows.forEach((h, k) => { ws.getRow(k + 1).height = h; });
  // merge first, then give EVERY cell its own style object (ExcelJS shares style objects between cells, so editing one
  // cell's border would change the others); each edge of a merged block is kept on the cell that carries it.
  for (const m of sheet.merges) ws.mergeCells(m);
  const edge = () => ({ style: "thin" as const, color: { argb: "FF000000" } });
  for (const [addr, c] of sheet.cells) {
    const cell = ws.getCell(addr);
    const b = c.border ?? "";
    cell.style = {
      font: c.font ? { name: c.font.name, size: c.font.size, bold: c.font.bold, italic: c.font.italic } : undefined,
      alignment: { horizontal: c.h ?? undefined, vertical: "middle", wrapText: c.wrap },
      border: { left: b.includes("l") ? edge() : undefined, right: b.includes("r") ? edge() : undefined,
        top: b.includes("t") ? edge() : undefined, bottom: b.includes("b") ? edge() : undefined },
      fill: c.fill ? { type: "pattern", pattern: "solid", fgColor: { argb: `FF${c.fill}` } } : undefined,
      numFmt: c.numFmt,
    } as never;
    if (c.v !== null && c.v !== undefined && c.v !== "") cell.value = c.v;
  }
  const stamp = sheet.stamp && doc.issuer.stamp ? dataUrlParts(doc.issuer.stamp) : null;
  if (stamp && sheet.stamp) {
    const img = wb.addImage({ base64: stamp.base64, extension: stamp.ext });
    // the stamp sits in the "Company Stamp" box under its label (K..N), square so the round stamp is not stretched
    const box = { w: [10, 11, 12, 13].reduce((t, c) => t + colPoints(sheet.cols[c]) / 0.75, 0),
      h: [1, 2, 3, 4, 5].reduce((t, d) => t + (sheet.rows[sheet.stamp!.fromRow + d] ?? 15) / 0.75, 0) };
    const dim = imageSize(Buffer.from(stamp.base64, "base64")) ?? { w: 1, h: 1 };
    const fit = Math.min(box.w / dim.w, box.h / dim.h) * 0.96;
    ws.addImage(img, { tl: { col: sheet.stamp.fromCol + 0.1, row: sheet.stamp.fromRow + 1.05 }, ext: { width: dim.w * fit, height: dim.h * fit } });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export { fmtMoney, fmtDay };
