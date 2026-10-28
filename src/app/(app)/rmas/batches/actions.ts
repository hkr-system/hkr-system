"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/brevo";
import { FILES_BUCKET } from "@/lib/files";
import { batchFileName, batchXlsx } from "@/lib/documents/rma-batch";
import { loadBatchDoc } from "@/lib/rmas/batch";

export type ActionState = { ok?: boolean; error?: string; message?: string };
const OPS = ["admin", "account_specialist"] as const;   // a batch mixes several clients (SOP P11)

function done(message?: string): ActionState {
  revalidatePath("/rmas/batches");
  revalidatePath("/rmas");
  return { ok: true, message };
}

export async function startBatch(intermediaryId: string, cutoffDate: string): Promise<ActionState> {
  await requireRole(OPS);
  const db = await createClient();
  const { error } = await db.from("rma_batches").insert({ intermediary_id: intermediaryId, cutoff_date: cutoffDate });
  if (error && error.code !== "23505") return { error: error.message };
  return done();
}

export async function addToBatch(batchId: string, unitIds: string[]): Promise<ActionState> {
  await requireRole(OPS);
  if (!unitIds.length) return { error: "Choose the units first." };
  const db = await createClient();
  const { data: b } = await db.from("rma_batches").select("status").eq("id", batchId).single();
  if (b?.status !== "open") return { error: "This batch is already shipped." };
  for (const id of unitIds) {
    const { error } = await db.from("rma_units").update({ batch_id: batchId }).eq("id", id);
    if (error) return { error: error.message };
  }
  return done(`${unitIds.length} unit${unitIds.length === 1 ? "" : "s"} added to the batch.`);
}

export async function removeFromBatch(unitId: string): Promise<ActionState> {
  await requireRole(OPS);
  const db = await createClient();
  const { error } = await db.from("rma_units").update({ batch_id: null }).eq("id", unitId);
  if (error) return { error: error.message };
  return done();
}

export async function saveBatchShipment(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(OPS);
  const id = String(fd.get("id"));
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const db = await createClient();
  const { error } = await db.from("rma_batches").update({
    pickup_date: s("pickup_date") || null, carrier: s("carrier") || "DHL Express", awb: s("awb") || null,
    boxes: s("boxes") ? Number(s("boxes")) : null, weight_kg: s("weight_kg") ? Number(s("weight_kg")) : null, notes: s("notes") || null,
  }).eq("id", id);
  if (error) return { error: error.message };
  return done("Saved.");
}

export async function saveBatchLabel(batchId: string, path: string, name: string): Promise<ActionState> {
  await requireRole(OPS);
  if (!path.startsWith(`batches/${batchId}/`)) return { error: "Wrong file location." };
  const db = await createClient();
  const { error } = await db.from("rma_batches").update({ label_path: path, label_name: name }).eq("id", batchId);
  if (error) return { error: error.message };
  return done("Label saved.");
}

// "Mark shipped": status Shipped (units → Shipped to HK) and the email with the consolidated
// Excel and the label to the recipients in Settings (brief Phase 4), when Brevo is connected.
export async function markBatchShipped(batchId: string): Promise<ActionState> {
  await requireRole(OPS);
  const db = await createClient();
  const { error } = await db.from("rma_batches").update({ status: "shipped" }).eq("id", batchId);
  if (error) return { error: error.message };
  const doc = await loadBatchDoc(db, batchId);
  if (!doc) return { error: "Batch not found." };
  if (!doc.recipients.length) return done("Shipped. No email sent: add the recipients in Settings → “EU batch email recipients”.");
  try {
    const attachments = [{ name: batchFileName(doc), content: await batchXlsx(doc) }];
    if (doc.labelPath) {
      const { data } = await db.storage.from(FILES_BUCKET).download(doc.labelPath);
      if (data) attachments.push({ name: doc.label ?? "label.pdf", content: Buffer.from(await data.arrayBuffer()) });
    }
    const { data: snd } = await db.from("settings").select("value").eq("key", "email_sender").maybeSingle();
    const sender = (snd?.value ?? { email: "noreply@hk-refurbished-stock.com", name: "HKR System" }) as { email: string; name: string };
    const clients = [...new Set(doc.units.map((u) => u.clientCode))];
    await sendTransactionalEmail({
      sender, to: doc.recipients,
      subject: `RMA batch ${doc.intermediary} ${doc.cutoff} shipped — ${doc.units.length} units, AWB ${doc.awb ?? "—"}`,
      html: `<p>RMA consolidated shipment from <b>${doc.intermediary}</b> (cut-off ${doc.cutoff}).</p>
        <p>${doc.units.length} units · ${clients.length} clients (${clients.join(", ")}) · ${doc.carrier} AWB <b>${doc.awb ?? "—"}</b>
        · ${doc.boxes ?? "—"} boxes · ${doc.weight ?? "—"} kg · pickup ${doc.pickup ?? "—"}.</p>
        <p>The consolidated Excel${doc.labelPath ? " and the label are" : " is"} attached.</p>`,
      attachments,
    });
    await db.from("rma_batches").update({ email_sent_at: new Date().toISOString() }).eq("id", batchId);
    return done(`Shipped. Email sent to ${doc.recipients.join(", ")}.`);
  } catch (e) {
    return done(`Shipped, but the email was not sent: ${(e as Error).message}`);
  }
}

export async function markBatchReceived(batchId: string): Promise<ActionState> {
  await requireRole(OPS);
  const db = await createClient();
  const { error } = await db.from("rma_batches").update({ status: "received" }).eq("id", batchId);
  if (error) return { error: error.message };
  return done("Received in Hong Kong: units and RMAs updated.");
}

export async function deleteBatch(batchId: string): Promise<ActionState> {
  await requireRole(["admin"]);
  const db = await createClient();
  await db.from("rma_units").update({ batch_id: null }).eq("batch_id", batchId);
  const { error } = await db.from("rma_batches").delete().eq("id", batchId);
  if (error) return { error: error.message };
  return done();
}
