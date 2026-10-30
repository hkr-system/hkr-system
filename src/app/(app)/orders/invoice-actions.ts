"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/files";
import { invoiceFileBase, type InvoiceLine } from "@/lib/documents/invoice-lines";
import { invoiceXlsx, loadInvoiceDoc } from "@/lib/documents/invoice";
import { invoicePdf } from "@/lib/documents/invoice-pdf";
import { invoiceDraftFromOrder } from "@/lib/orders/invoice-draft";

export type InvoiceState = { ok?: boolean; error?: string; message?: string };

// Brief Phase 3 item 6: the specialist prepares, the admin approves; both mark it sent.
const PREPARERS = ["admin", "account_specialist"] as const;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function friendly(e: { code?: string; message: string }) {
  if (e.code === "42501" && !/admin|invoice/i.test(e.message)) return "You do not have access to do this.";
  if (/invoices_one_live_per_order/.test(e.message)) return "This order already has an invoice.";
  return e.message;
}

function refresh(orderId: string, accountId?: string) {
  revalidatePath(`/orders/${orderId}`);
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

export async function createInvoiceDraft(orderId: string): Promise<InvoiceState> {
  await requireRole(PREPARERS);
  const db = await createClient();
  const d = await invoiceDraftFromOrder(db, orderId);
  if (!d) return { error: "Order not found." };
  if (!d.lines.length) return { error: "The order has no lines yet." };
  const { orderTotal: _orderTotal, ...row } = d;
  void _orderTotal;
  const { error } = await db.from("invoices").insert({ ...row, order_id: orderId, lines: row.lines as never, notify: row.notify as never, shipment: row.shipment as never });
  if (error) return { error: friendly(error) };
  refresh(orderId);
  return { ok: true, message: "Draft created from the order. Check the texts, then an admin approves it." };
}

// Lines, totals and payment method again from the order (after the order was edited). Draft only.
export async function refreshInvoiceFromOrder(id: string, alsoHeader = false): Promise<InvoiceState> {
  await requireRole(PREPARERS);
  const db = await createClient();
  const { data: inv } = await db.from("invoices").select("order_id, status").eq("id", id).maybeSingle();
  if (!inv) return { error: "Invoice not found." };
  if (inv.status !== "draft") return { error: "Only a draft can be refreshed." };
  const d = await invoiceDraftFromOrder(db, inv.order_id);
  if (!d) return { error: "Order not found." };
  const patch = alsoHeader
    ? { billing_entity: d.billing_entity, payment_method: d.payment_method, lines: d.lines as never, total_usd: d.total_usd, consignee: d.consignee, ship_to: d.ship_to, notify: d.notify as never, shipment: d.shipment as never }
    : { billing_entity: d.billing_entity, payment_method: d.payment_method, lines: d.lines as never, total_usd: d.total_usd };
  const { error } = await db.from("invoices").update(patch).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh(inv.order_id);
  return { ok: true, message: alsoHeader ? "Lines and addresses taken again from the order and the account." : "Lines and totals taken again from the order." };
}

// Texts the preparer may adjust on a draft: date, address blocks, notify party, shipment data and
// each line's description (SIM, battery health, CE/UKCA, colour mix…). Amounts always come from the order.
export async function saveInvoiceDraft(_p: InvoiceState, fd: FormData): Promise<InvoiceState> {
  await requireRole(PREPARERS);
  const db = await createClient();
  const id = str(fd, "id");
  const { data: inv } = await db.from("invoices").select("order_id, status, lines").eq("id", id).maybeSingle();
  if (!inv) return { error: "Invoice not found." };
  if (inv.status !== "draft") return { error: "Only a draft can be edited." };
  const date = str(fd, "invoice_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Enter the invoice date." };
  const lines = ((inv.lines ?? []) as unknown as InvoiceLine[]).map((l, i) => ({ ...l, description: str(fd, `line_${i}`) || l.description }));
  const { error } = await db.from("invoices").update({
    invoice_date: date,
    consignee: str(fd, "consignee"), ship_to: str(fd, "ship_to"),
    notify: { contact: str(fd, "notify_contact"), address: str(fd, "notify_address"), phone: str(fd, "notify_phone") },
    shipment: { country: str(fd, "ship_country"), reference: str(fd, "ship_reference") || "N/A", awb: str(fd, "ship_awb") || "N/A", airport: str(fd, "ship_airport") },
    lines: lines as never,
  }).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh(inv.order_id);
  return { ok: true, message: "Saved." };
}

export async function approveInvoice(id: string): Promise<InvoiceState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const { data: inv } = await db.from("invoices").select("order_id, total_usd, orders(total_usd)").eq("id", id).maybeSingle();
  if (!inv) return { error: "Invoice not found." };
  const orderTotal = Number((inv.orders as unknown as { total_usd: number }).total_usd);
  if (Math.abs(orderTotal - Number(inv.total_usd)) > 0.004) {
    return { error: `The invoice total differs from the order total (${orderTotal.toFixed(2)}). Press "Take lines again from the order" first.` };
  }
  const { error } = await db.from("invoices").update({ status: "approved" }).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh(inv.order_id);
  return { ok: true, message: "Approved. The order now shows this invoice number." };
}

// Stores this version's PDF + xlsx in the order folder ([code]_ORD-NN_INV-HK[_vN]) — the client sees them in the portal.
export async function markInvoiceSent(id: string): Promise<InvoiceState> {
  await requireRole(PREPARERS);
  const db = await createClient();
  const { data: inv } = await db.from("invoices").select("order_id, account_id, status").eq("id", id).maybeSingle();
  if (!inv) return { error: "Invoice not found." };
  if (inv.status !== "approved") return { error: "Only an approved invoice can be sent." };
  const { error: se } = await db.from("invoices").update({ status: "sent" }).eq("id", id);
  if (se) return { error: friendly(se) };
  const doc = await loadInvoiceDoc(db, id);
  if (!doc) return { error: "Invoice not found." };
  const base = invoiceFileBase(doc.accountCode, doc.orderNumber, doc.version);
  const [pdf, xlsx] = await Promise.all([invoicePdf(doc), invoiceXlsx(doc)]);
  const ids: Record<string, string> = {};
  for (const [ext, body, mime] of [["pdf", pdf, "application/pdf"], ["xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]] as const) {
    const path = `${inv.account_id}/orders/${doc.orderNumber}/${base}.${ext}`;
    const { error } = await db.storage.from(FILES_BUCKET).upload(path, body, { contentType: mime, upsert: true });
    if (error) return { error: `Marked as sent, but the file could not be saved: ${error.message}` };
    const { data: existing } = await db.from("files").select("id").eq("storage_path", path).maybeSingle();
    if (existing) ids[ext] = existing.id;
    else {
      const { data: f, error: fe } = await db.from("files").insert({
        account_id: inv.account_id, owner_table: "orders", owner_id: inv.order_id, kind: "INV-HK",
        storage_path: path, file_name: `${base}.${ext}`, mime_type: mime, size_bytes: body.length,
      }).select("id").single();
      if (fe) return { error: `Marked as sent, but the file could not be registered: ${fe.message}` };
      ids[ext] = f.id;
    }
  }
  await db.from("invoices").update({ file_pdf_id: ids.pdf, file_xlsx_id: ids.xlsx }).eq("id", id);
  refresh(inv.order_id, inv.account_id);
  return { ok: true, message: "Sent: PDF and xlsx saved in the order documents (the client sees them in the portal)." };
}

export async function reopenInvoice(id: string): Promise<InvoiceState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const { data, error } = await db.from("invoices").update({ status: "draft", file_pdf_id: null, file_xlsx_id: null }).eq("id", id).select("order_id, version").single();
  if (error) return { error: friendly(error) };
  refresh(data.order_id);
  return { ok: true, message: `Reopened as version ${data.version}. The files already sent stay in the documents.` };
}

export async function deleteInvoiceDraft(id: string): Promise<InvoiceState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const { data, error } = await db.from("invoices").delete().eq("id", id).eq("status", "draft").select("order_id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "Only a draft can be deleted." };
  refresh(data[0].order_id);
  return { ok: true, message: "Draft deleted." };
}
