import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { IntermediaryRow } from "@/app/(app)/settings/intermediaries";
import { parseD2D } from "@/lib/price-lists/door-to-door";

type Db = Awaited<ReturnType<typeof createClient>>;

/** The list of intermediaries & clearance companies with how many orders / clients / RMA batches use each (only unused ones
 *  can be removed). Used by Settings (admin) and Accounts → Intermediaries & clearance (admin + specialist). */
export async function loadIntermediaryRows(db: Db): Promise<IntermediaryRow[]> {
  const [intermediaries, imOrders, imAccounts, imBatches] = await Promise.all([
    db.from("intermediaries").select("id, name, kind, rsin, eori, kvk, vat, contact, contact_phone, contact_email, address, country, default_cutoff_weekday, d2d").order("name"),
    db.from("orders").select("intermediary_id").not("intermediary_id", "is", null),
    db.from("accounts").select("intermediary_id").not("intermediary_id", "is", null),
    db.from("rma_batches").select("intermediary_id"),
  ]);
  const countBy = (rows: { intermediary_id: string | null }[] | null, id: string) => (rows ?? []).filter((r) => r.intermediary_id === id).length;
  return (intermediaries.data ?? []).map((i) => ({
    ...i, kind: (i.kind === "clearance" ? "clearance" : "intermediary") as "clearance" | "intermediary", d2d: parseD2D(i.d2d),
    orders: countBy(imOrders.data, i.id), clients: countBy(imAccounts.data, i.id), batches: countBy(imBatches.data, i.id),
  }));
}
