import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Everything a credit note document shows (layout of HKR_Credit_Note_TEMPLATE.xlsx, SOP P10).
// Issuer and signer come from Settings → "Credit note issuer and signer", never from the code.
export type Issuer = { company?: string; address?: string[]; phone?: string; whatsapp?: string; signer_name?: string; signer_title?: string };
export type CreditNoteDoc = {
  number: string; status: string; currency: "USD" | "EUR"; date: string;
  issuer: Issuer;
  inFavorOf: string; vatEori: string | null; country: string | null; accountCode: string;
  reference: string;   // invoice, RMA and how it is applied
  lines: { description: string; qty: number; unitPrice: number; total: number }[];
  total: number;
  reason: string | null;
};

export async function loadCreditNoteDoc(db: SupabaseClient<Database>, id: string): Promise<CreditNoteDoc | null> {
  const { data: c } = await db.from("credit_notes")
    .select("*, accounts(code, legal_name, name, vat_eori, country), rmas(number), credit_note_lines(description, qty, unit_price, sort_order)")
    .eq("id", id).maybeSingle();
  if (!c) return null;
  const { data: s } = await db.from("settings").select("value").eq("key", "credit_note_issuer").maybeSingle();
  const acc = c.accounts as unknown as { code: string; legal_name: string | null; name: string; vat_eori: string | null; country: string | null };
  const rma = c.rmas as unknown as { number: string } | null;
  const lines = ((c.credit_note_lines ?? []) as { description: string; qty: number; unit_price: number; sort_order: number }[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({ description: l.description, qty: Number(l.qty), unitPrice: Number(l.unit_price), total: Math.round(Number(l.qty) * Number(l.unit_price) * 100) / 100 }));
  const applied = c.applied_to === "refund" ? "refund" : c.applied_to === "order_balance" ? "balance of an order" : "next invoice";
  return {
    number: c.number, status: c.status, currency: c.currency, date: c.issued_on ?? new Date().toISOString().slice(0, 10),
    issuer: (s?.value ?? {}) as Issuer,
    inFavorOf: c.in_favor_of || acc.legal_name || acc.name, vatEori: acc.vat_eori, country: acc.country, accountCode: acc.code,
    reference: [`Invoice ${c.invoice_no || "—"}`, `RMA ${rma?.number ?? "—"}`, `Applied to: ${applied}${c.applied_invoice_no ? ` ${c.applied_invoice_no}` : ""}`].join(" · "),
    lines, total: lines.reduce((t, l) => t + l.total, 0), reason: c.reason,
  };
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function fmtDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

// xlsx in the template's grid (columns B–AA, Times New Roman headings, Courier New figures).
export async function creditNoteXlsx(doc: CreditNoteDoc): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Credit note", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 } });
  ws.getColumn(1).width = 1;
  for (let c = 2; c <= 27; c++) ws.getColumn(c).width = 3.9;
  const thin = { style: "thin" as const };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const put = (range: string, value: string | number | null, opts: { bold?: boolean; size?: number; font?: string; align?: "left" | "center" | "right"; border?: boolean; numFmt?: string; wrap?: boolean } = {}) => {
    ws.mergeCells(range);
    const cell = ws.getCell(range.split(":")[0]);
    cell.value = value;
    cell.font = { name: opts.font ?? "Times New Roman", size: opts.size ?? 9, bold: opts.bold };
    cell.alignment = { horizontal: opts.align ?? "left", vertical: "middle", wrapText: opts.wrap ?? false };
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    if (opts.border) cell.border = box;
  };
  put("B1:AA3", doc.status === "draft" ? "COMMERCIAL CREDIT NOTE — DRAFT" : "COMMERCIAL CREDIT NOTE", { bold: true, size: 14, align: "center" });
  put("V5:AA6", ` No: ${doc.number}`, { bold: true, size: 8 });
  put("B7:K7", "Issuer Name and Address:", { bold: true, size: 8 });
  put("L7:S7", "In favor of:", { bold: true, size: 8 });
  put("T7:AA7", "Date of issue:", { bold: true, size: 8 });
  const issuerLines = [doc.issuer.company ?? "", ...(doc.issuer.address ?? []), doc.issuer.phone ?? ""].filter(Boolean);
  const favorLines = [doc.inFavorOf, doc.vatEori ? `VAT / EORI: ${doc.vatEori}` : "", doc.country ?? "", `Client code: ${doc.accountCode}`].filter(Boolean);
  for (let i = 0; i < 4; i++) {
    const r = 8 + i;
    put(`B${r}:K${r}`, issuerLines[i] ?? "", { size: 8 });
    put(`L${r}:S${r}`, favorLines[i] ?? "", { size: 8 });
    put(`T${r}:AA${r}`, i === 0 ? fmtDay(doc.date) : "", { size: 8 });
  }
  put("B12:C14", "Line #", { bold: true, size: 8, align: "center", border: true });
  put("D12:P14", "Harmonized Number, Product Description", { bold: true, size: 8, align: "center", border: true });
  put("Q12:R14", "Made in", { bold: true, size: 8, align: "center", border: true });
  put("S12:U14", "Quantity", { bold: true, size: 8, align: "center", border: true });
  put("V12:X14", "U. Price", { bold: true, size: 8, align: "center", border: true });
  put("Y12:AA14", "Total Price", { bold: true, size: 8, align: "center", border: true });
  put("B15:AA15", doc.reference, { size: 8, border: true });
  let r = 16;
  doc.lines.forEach((l, i) => {
    put(`B${r}:C${r}`, i + 1, { font: "Courier New", align: "center", border: true });
    put(`D${r}:P${r}`, l.description, { font: "Courier New", border: true, wrap: true });
    put(`Q${r}:R${r}`, "China", { font: "Courier New", border: true });
    put(`S${r}:U${r}`, l.qty, { font: "Courier New", align: "right", border: true });
    put(`V${r}:X${r}`, l.unitPrice, { font: "Courier New", align: "right", border: true, numFmt: "#,##0.00" });
    ws.mergeCells(`Y${r}:AA${r}`);
    const t = ws.getCell(`Y${r}`);
    t.value = { formula: `V${r}*S${r}`, result: l.total };
    t.numFmt = "#,##0.00"; t.font = { name: "Courier New", size: 9 }; t.border = box; t.alignment = { horizontal: "right" };
    ws.getRow(r).height = l.description.length > 60 ? 24 : 15;
    r++;
  });
  put(`B${r}:X${r + 1}`, `Total C.F.R.: ${doc.currency}`, { font: "Courier New", align: "right", border: true, bold: true });
  ws.mergeCells(`Y${r}:AA${r + 1}`);
  const tot = ws.getCell(`Y${r}`);
  tot.value = { formula: `SUM(Y16:AA${r - 1})`, result: doc.total };
  tot.numFmt = "#,##0.00"; tot.font = { name: "Courier New", size: 9, bold: true }; tot.border = box; tot.alignment = { horizontal: "right", vertical: "middle" };
  r += 3;
  put(`B${r}:J${r}`, "Authorized Signature:", { bold: true, size: 8 });
  put(`K${r}:N${r}`, "Company Stamp", { bold: true, size: 8 });
  put(`O${r}:AA${r}`, "Company:", { bold: true, size: 8 });
  put(`O${r + 1}:AA${r + 1}`, doc.issuer.company ?? "", { size: 8 });
  put(`B${r + 2}:J${r + 2}`, "Name:", { bold: true, size: 8 });
  put(`O${r + 2}:AA${r + 2}`, "Telephone Number(s):", { bold: true, size: 8 });
  put(`B${r + 3}:J${r + 3}`, doc.issuer.signer_name ?? "", { size: 8 });
  put(`O${r + 3}:T${r + 3}`, doc.issuer.phone ? `Voice: ${doc.issuer.phone}` : "", { size: 8 });
  put(`U${r + 3}:AA${r + 3}`, doc.issuer.whatsapp ? `Whatsapp: ${doc.issuer.whatsapp}` : "", { size: 8 });
  put(`B${r + 4}:J${r + 4}`, "Title:", { bold: true, size: 8 });
  put(`O${r + 4}:AA${r + 4}`, "Date of issue:", { bold: true, size: 8 });
  put(`B${r + 5}:J${r + 5}`, doc.issuer.signer_title ?? "", { size: 8 });
  put(`O${r + 5}:AA${r + 5}`, fmtDay(doc.date), { size: 8 });
  put(`B${r + 6}:AA${r + 6}`, "This invoice is for export/import and payments purposes.", { size: 8 });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
