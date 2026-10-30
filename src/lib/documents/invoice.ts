import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fmtDay, fmtMoney } from "./credit-note";
import { invoiceTitle, type InvoiceLine } from "./invoice-lines";

// Commercial invoice in the layout of the reference invoices (Ever State, Oct 2026).
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

function dataUrlParts(url: string): { base64: string; ext: "png" | "jpeg" } | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(url);
  return m ? { base64: m[2], ext: m[1] === "png" ? "png" : "jpeg" } : null;
}

// xlsx in the reference grid: columns B–AA, Times New Roman, figures right-aligned.
export async function invoiceXlsx(doc: InvoiceDoc): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoice", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.getColumn(1).width = 1;
  for (let c = 2; c <= 27; c++) ws.getColumn(c).width = 4;
  const thin = { style: "thin" as const };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  type Opt = { bold?: boolean; size?: number; align?: "left" | "center" | "right"; border?: boolean; money?: boolean; wrap?: boolean; color?: string };
  const put = (range: string, value: string | number | null | undefined, o: Opt = {}) => {
    if (range.includes(":")) ws.mergeCells(range);
    const cell = ws.getCell(range.split(":")[0]);
    cell.value = value ?? "";
    cell.font = { name: "Times New Roman", size: o.size ?? 9, bold: o.bold, color: o.color ? { argb: o.color } : undefined };
    cell.alignment = { horizontal: o.align ?? "left", vertical: "middle", wrapText: o.wrap ?? false };
    if (o.money) cell.numFmt = "#,##0.00";
    if (o.border) cell.border = box;
  };
  const t = doc.texts;
  put("B1:AA2", invoiceTitle(doc.status), { bold: true, size: 14, align: "center", color: doc.status === "draft" ? "FFD6192E" : undefined });
  put("B4:K4", "Export References:", { bold: true, size: 8 });
  put("B5:R5", t.export_reference ?? "Export Invoice of Electronics Products", { size: 8 });
  put("V5:AA5", `Invoice No: ${doc.number}`, { bold: true, size: 9 });
  put("B7:K7", "Exporter Name and Address:", { bold: true, size: 8 });
  put("L7:S7", "Ultimate Consignee Name and Address:", { bold: true, size: 8 });
  put("T7:AA7", "Ship To Name and Address:", { bold: true, size: 8 });
  const exporter = [doc.issuer.company, ...(doc.issuer.address ?? []), doc.issuer.phone].filter(Boolean) as string[];
  const rowsTop = Math.max(5, exporter.length, doc.consignee.length, doc.shipTo.length);
  for (let i = 0; i < rowsTop; i++) {
    const r = 8 + i;
    put(`B${r}:K${r}`, exporter[i] ?? "", { size: 8, bold: i === 0 });
    put(`L${r}:S${r}`, doc.consignee[i] ?? "", { size: 8, bold: i === 0 });
    put(`T${r}:AA${r}`, doc.shipTo[i] ?? "", { size: 8, bold: i === 0 });
  }
  let r = 8 + rowsTop + 1;
  const pair = (left: [string, string] | null, right: string) => {
    if (left) { put(`L${r}:M${r}`, left[0], { bold: true, size: 8 }); put(`N${r}:S${r}`, left[1], { size: 8 }); }
    put(`T${r}:AA${r}`, right, { size: 8 });
    r++;
  };
  put(`L${r}:S${r}`, "Notify Party Name and Address:", { bold: true, size: 8 });
  put(`T${r}:AA${r}`, fmtDay(doc.date), { size: 8 }); r++;
  pair(["Contact:", doc.notify.contact ?? ""], `Shippment Reference: ${doc.shipment.reference || "N/A"}`);
  pair(["Address:", doc.notify.address ?? ""], `Air Way Bill Number: ${doc.shipment.awb || "N/A"}`);
  pair(null, `Country of consignation: ${doc.shipment.country ?? ""}`);
  pair(["Phone:", doc.notify.phone ?? ""], `Airport of Consignation: ${doc.shipment.airport ?? ""}`);
  r++;
  const cond = (a: [string, string], b: [string, string], c: [string, string], wideLabel = false) => {
    put(`B${r}:${wideLabel ? "D" : "C"}${r}`, a[0], { bold: true, size: 8 }); put(`${wideLabel ? "E" : "D"}${r}:K${r}`, a[1], { size: 8 });
    put(`L${r}:M${r}`, b[0], { bold: true, size: 8 }); put(`N${r}:S${r}`, b[1], { size: 8 });
    put(`T${r}:Y${r}`, c[0], { bold: true, size: 8 }); put(`Z${r}:AA${r}`, c[1], { size: 8 });
    r++;
  };
  put(`B${r}:K${r}`, "Condition of Sale and Terms of Payment:", { bold: true, size: 8 });
  put(`L${r}:S${r}`, "Transportation:", { bold: true, size: 8 });
  put(`T${r}:Y${r}`, "Total Number of Packages:", { bold: true, size: 8 }); put(`Z${r}:AA${r}`, t.packages ?? "1", { size: 8 }); r++;
  cond(["Freight:", t.freight ?? "FOB HK"], ["Via:", t.via ?? "FEDEX/DHL Express"], ["Total Net Weight (kgs):", t.net_kg ?? "N/A"]);
  cond(["Payment Terms:", t.payment_terms ?? "Pre-payment"], ["From:", t.from ?? "Hong Kong"], ["Total Gross Weight (kgs):", t.gross_kg ?? "N/A"], true);
  r++;
  const head: [string, string][] = [[`B${r}:C${r}`, "Line #"], [`D${r}:P${r}`, "Harmonized Number, Product Description"], [`Q${r}:R${r}`, "Made in"], [`S${r}:U${r}`, "Quantity"], [`V${r}:X${r}`, "U. Price"], [`Y${r}:AA${r}`, "Total Price"]];
  for (const [range, label] of head) put(range, label, { bold: true, size: 8, align: "center", border: true, wrap: true });
  ws.getRow(r).height = 24;
  r++;
  let n = 0;
  for (const l of doc.lines) {
    const product = l.kind === "product";
    put(`B${r}:C${r}`, product ? ++n : "", { size: 8, align: "center", border: true });
    put(`D${r}:P${r}`, l.description, { size: 8, border: true, wrap: true });
    put(`Q${r}:R${r}`, product ? t.made_in ?? "China" : "", { size: 8, align: "center", border: true });
    put(`S${r}:U${r}`, l.qty ?? "", { size: 8, align: "right", border: true });
    put(`V${r}:X${r}`, l.unit_price ?? "", { size: 8, align: "right", border: true, money: l.unit_price != null });
    put(`Y${r}:AA${r}`, l.total, { size: 8, align: "right", border: true, money: true });
    if (l.description.length > 70) ws.getRow(r).height = 24;
    r++;
  }
  for (const p of doc.payment) { put(`D${r}:P${r}`, p, { size: 8 }); r++; }
  put(`B${r}:X${r}`, "Total C.F.R.: USD", { bold: true, size: 9, align: "right", border: true });
  put(`Y${r}:AA${r}`, doc.total, { bold: true, size: 9, align: "right", border: true, money: true });
  r += 2;
  for (const note of t.notes ?? []) { put(`B${r}:AA${r}`, note, { size: 7 }); r++; }
  r++;
  const signTop = r;
  put(`B${r}:J${r}`, "Authorized Signature:", { bold: true, size: 8 }); put(`K${r}:N${r}`, "Company Stamp", { bold: true, size: 8 }); put(`O${r}:AA${r}`, "Company:", { bold: true, size: 8 }); r++;
  put(`O${r}:AA${r}`, doc.issuer.company ?? "", { size: 8 }); r++;
  put(`B${r}:J${r}`, "Name:", { bold: true, size: 8 }); put(`O${r}:AA${r}`, "Telephone Number(s):", { bold: true, size: 8 }); r++;
  put(`B${r}:J${r}`, doc.issuer.signer_name ?? "", { size: 8 });
  put(`O${r}:T${r}`, doc.issuer.phone ? `Voice: ${doc.issuer.phone}` : "", { size: 8 });
  put(`U${r}:AA${r}`, doc.issuer.whatsapp ? `Whatsapp: ${doc.issuer.whatsapp}` : "", { size: 8 }); r++;
  put(`B${r}:J${r}`, "Title:", { bold: true, size: 8 }); put(`O${r}:AA${r}`, "Date of Order:", { bold: true, size: 8 }); r++;
  put(`B${r}:J${r}`, doc.issuer.signer_title ?? "", { size: 8 }); put(`O${r}:AA${r}`, fmtDay(doc.orderDate), { size: 8 }); r++;
  put(`B${r}:AA${r}`, t.footer ?? "This invoice is for export/import and payments purposes.", { size: 8 });
  const stamp = showStamp(doc) && doc.issuer.stamp ? dataUrlParts(doc.issuer.stamp) : null;
  if (stamp) {
    const img = wb.addImage({ base64: stamp.base64, extension: stamp.ext });
    ws.addImage(img, { tl: { col: 10.1, row: signTop - 0.2 }, ext: { width: 92, height: 88 } });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export { fmtMoney, fmtDay };
