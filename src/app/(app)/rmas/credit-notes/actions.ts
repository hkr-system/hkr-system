"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/files";
import { creditNoteXlsx, loadCreditNoteDoc } from "@/lib/documents/credit-note";
import { creditNotePdf } from "@/lib/documents/credit-note-pdf";
import type { CreditAppliedTo, CreditNoteStatus } from "@/lib/rmas/constants";

export type ActionState = { ok?: boolean; error?: string; message?: string; id?: string };
const STAFF = ["admin", "bd", "account_specialist"] as const;

function friendly(e: { code?: string; message: string }) {
  if (e.code === "42501" && !/admin|only/i.test(e.message)) return "You do not have access to do this.";
  return e.message;
}

export type CnInput = {
  id?: string | null; accountId: string; rmaId?: string | null; orderId?: string | null; invoiceNo?: string | null;
  inFavorOf?: string | null; currency: "USD" | "EUR"; reason?: string | null; appliedTo: CreditAppliedTo; notes?: string | null;
  lines: { description: string; qty: number; unit_price: number }[];
};

export async function saveCreditNote(input: CnInput): Promise<ActionState> {
  await requireRole(STAFF);
  const lines = input.lines.filter((l) => l.description.trim()).map((l, i) => ({
    description: l.description.trim(), qty: Number(l.qty) || 0, unit_price: Number(l.unit_price), sort_order: i + 1,
  }));
  if (!lines.length) return { error: "Add at least one line (one per concept)." };
  if (lines.some((l) => !(l.qty > 0) || !(l.unit_price >= 0))) return { error: "Every line needs a quantity and a unit price." };
  const db = await createClient();
  const fields = {
    rma_id: input.rmaId || null, order_id: input.orderId || null, invoice_no: input.invoiceNo || null,
    in_favor_of: input.inFavorOf || null, currency: input.currency, reason: input.reason || null,
    applied_to: input.appliedTo, notes: input.notes || null,
  };
  let id = input.id ?? null;
  if (id) {
    const { error } = await db.from("credit_notes").update(fields).eq("id", id);
    if (error) return { error: friendly(error) };
    const { error: d } = await db.from("credit_note_lines").delete().eq("credit_note_id", id);
    if (d) return { error: friendly(d) };
  } else {
    const { data, error } = await db.from("credit_notes").insert({ ...fields, account_id: input.accountId }).select("id").single();
    if (error) return { error: friendly(error) };
    id = data.id;
  }
  const { error: e2 } = await db.from("credit_note_lines").insert(lines.map((l) => ({ ...l, credit_note_id: id!, account_id: input.accountId })));
  if (e2) return { error: friendly(e2) };
  revalidatePath("/rmas/credit-notes");
  revalidatePath(`/rmas/credit-notes/${id}`);
  return { ok: true, id: id!, message: "Saved." };
}

// Generates the PDF + xlsx and stores them in the account files (RMA folder, order folder or general).
async function storeDocuments(id: string): Promise<string | null> {
  const db = await createClient();
  const doc = await loadCreditNoteDoc(db, id);
  const { data: c } = await db.from("credit_notes").select("account_id, number, rmas(number), orders!credit_notes_order_id_fkey(number)").eq("id", id).single();
  if (!doc || !c) return "Credit note not found.";
  const rma = (c.rmas as unknown as { number: string } | null)?.number;
  const ord = (c.orders as unknown as { number: string } | null)?.number;
  // SOP §2.3: [code]_RMA-NN_CN or [code]_ORD-NN_CN; the CN number keeps several apart
  const base = rma ? `${rma.replace("-RMA-", "_RMA-")}_CN_${c.number.split("-CN-")[1]}` : ord ? `${doc.accountCode}_${ord}_CN_${c.number.split("-CN-")[1]}` : `${doc.accountCode}_CN_${c.number.split("-CN-")[1]}`;
  const folder = rma ? `rmas/RMA-${rma.split("-RMA-")[1]}` : ord ? `orders/${ord}` : "general";
  const [pdf, xlsx] = await Promise.all([creditNotePdf(doc), creditNoteXlsx(doc)]);
  const ids: Record<string, string> = {};
  for (const [ext, body, mime] of [["pdf", pdf, "application/pdf"], ["xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]] as const) {
    const path = `${c.account_id}/${folder}/${base}.${ext}`;
    const { error } = await db.storage.from(FILES_BUCKET).upload(path, body, { contentType: mime, upsert: true });
    if (error) return error.message;
    const { data: existing } = await db.from("files").select("id").eq("storage_path", path).maybeSingle();
    if (existing) ids[ext] = existing.id;
    else {
      const { data: f, error: fe } = await db.from("files").insert({
        account_id: c.account_id, owner_table: "credit_notes", owner_id: id, kind: "CN",
        storage_path: path, file_name: `${base}.${ext}`, mime_type: mime, size_bytes: body.length,
      }).select("id").single();
      if (fe) return fe.message;
      ids[ext] = f.id;
    }
  }
  const { error } = await db.from("credit_notes").update({ pdf_file_id: ids.pdf, xlsx_file_id: ids.xlsx }).eq("id", id);
  return error ? error.message : null;
}

export async function setCreditNoteStatus(id: string, status: CreditNoteStatus, appliedInvoiceNo?: string | null): Promise<ActionState> {
  await requireRole(STAFF);
  const db = await createClient();
  const patch: { status: CreditNoteStatus; applied_invoice_no?: string | null } = { status };
  if (status === "applied") patch.applied_invoice_no = appliedInvoiceNo?.trim() || null;
  const { data, error } = await db.from("credit_notes").update(patch).eq("id", id).select("rma_id").single();
  if (error) return { error: friendly(error) };
  let message = "Saved.";
  if (status === "issued") {
    const problem = await storeDocuments(id);
    message = problem ? `Issued, but the files could not be saved: ${problem}` : "Issued: PDF and xlsx saved in the account files and shown in the client portal.";
  }
  revalidatePath("/rmas/credit-notes");
  revalidatePath(`/rmas/credit-notes/${id}`);
  if (data.rma_id) revalidatePath(`/rmas/${data.rma_id}`);
  return { ok: true, message };
}

export async function regenerateCreditNoteFiles(id: string): Promise<ActionState> {
  await requireRole(STAFF);
  const problem = await storeDocuments(id);
  revalidatePath(`/rmas/credit-notes/${id}`);
  return problem ? { error: problem } : { ok: true, message: "Files saved again." };
}

export async function deleteCreditNote(id: string): Promise<ActionState> {
  await requireRole(STAFF);
  const db = await createClient();
  const { error, count } = await db.from("credit_notes").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "Only drafts can be deleted (an admin cancels an approved one)." };
  revalidatePath("/rmas/credit-notes");
  return { ok: true };
}
