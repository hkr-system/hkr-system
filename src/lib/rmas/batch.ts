import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { BatchDoc } from "@/lib/documents/rma-batch";

export async function loadBatchDoc(db: SupabaseClient<Database>, batchId: string): Promise<(BatchDoc & { id: string; status: string; labelPath: string | null }) | null> {
  const [{ data: b }, { data: units }, { data: rec }] = await Promise.all([
    db.from("rma_batches").select("*, intermediaries(name)").eq("id", batchId).maybeSingle(),
    db.from("rma_units").select("imei, model, storage_gb, fault_category, source, imei_check, hkr_notes, rmas(number, accounts(code, name)), orders(hk_invoice_no)")
      .eq("batch_id", batchId).order("imei"),
    db.from("settings").select("value").eq("key", "rma_batch_email_to").maybeSingle(),
  ]);
  if (!b) return null;
  return {
    id: b.id, status: b.status, labelPath: b.label_path,
    intermediary: (b.intermediaries as unknown as { name: string }).name, cutoff: b.cutoff_date, pickup: b.pickup_date, carrier: b.carrier,
    awb: b.awb, boxes: b.boxes, weight: b.weight_kg === null ? null : Number(b.weight_kg), label: b.label_name,
    emailSent: b.email_sent_at ? b.email_sent_at.slice(0, 10) : null,
    recipients: Array.isArray(rec?.value) ? (rec!.value as string[]) : [],
    units: (units ?? []).map((u) => {
      const r = u.rmas as unknown as { number: string; accounts: { code: string; name: string } };
      return {
        clientCode: r.accounts.code, client: r.accounts.name, imei: u.imei, model: u.model, storage: u.storage_gb, fault: u.fault_category,
        source: u.source, rma: r.number, check: u.imei_check === "ours" ? "OURS" : "NOT FOUND",
        invoice: (u.orders as unknown as { hk_invoice_no: string | null } | null)?.hk_invoice_no ?? null, notes: u.hkr_notes,
      };
    }),
  };
}
