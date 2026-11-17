import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/notify";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";

type Db = Awaited<ReturnType<typeof createClient>>;
export type CnApply = { credit_note_id: string; amount: number };
export type CnCreate = { reason: string; amount: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Reads the hidden form fields of the order form's "Credit notes" card. */
export function readCreditNoteFields(fd: FormData): { apply: CnApply[]; create: CnCreate[] } {
  const parse = <T,>(k: string): T[] => { try { const v = JSON.parse(String(fd.get(k) ?? "[]")); return Array.isArray(v) ? v : []; } catch { return []; } };
  return {
    apply: parse<CnApply>("cn_apply").map((a) => ({ credit_note_id: String(a.credit_note_id), amount: r2(Number(a.amount)) })).filter((a) => a.credit_note_id && a.amount > 0),
    create: parse<CnCreate>("cn_new").map((c) => ({ reason: String(c.reason ?? "").trim().slice(0, 200), amount: r2(Number(c.amount)) })).filter((c) => c.amount > 0),
  };
}

/**
 * Credit notes made or used right on an order (Gabriel, Nov 17 2026). An approved credit note of the client is applied at
 * once. A new one is created for this order: the admin's is approved and applied at once; anyone else's stays a draft
 * "pending for the SD" (SOP P10) that the database applies to this order when the admin approves it.
 */
export async function addCreditNotesToOrder(db: Db, o: { orderId: string; accountId: string; orderNumber: string; isAdmin: boolean; userId: string },
  apply: CnApply[], create: CnCreate[]): Promise<{ error?: string; pending: number }> {
  let pending = 0;
  for (const a of apply) {
    const { error } = await db.from("credit_note_applications").insert({ credit_note_id: a.credit_note_id, order_id: o.orderId, account_id: o.accountId, amount_usd: a.amount });
    if (error) return { error: error.message, pending };
  }
  const made: string[] = [];
  for (const c of create) {
    const reason = c.reason || "RMA discount";
    const { data: cn, error } = await db.from("credit_notes").insert({
      account_id: o.accountId, currency: "USD", reason, applied_to: "next_invoice",
      pending_order_id: o.orderId, pending_amount_usd: c.amount, notes: `Made on order ${o.orderNumber}.`,
    }).select("id, number").single();
    if (error) return { error: error.message, pending };
    const { error: le } = await db.from("credit_note_lines").insert({ credit_note_id: cn.id, account_id: o.accountId, description: reason, qty: 1, unit_price: c.amount, sort_order: 1 });
    if (le) return { error: le.message, pending };
    if (o.isAdmin) {
      const { error: ae } = await db.from("credit_notes").update({ status: "approved" }).eq("id", cn.id);   // the trigger applies it
      if (ae) return { error: ae.message, pending };
    } else {
      pending = r2(pending + c.amount);
      made.push(`${cn.number} (US$${c.amount.toFixed(2)})`);
    }
  }
  if (made.length && adminClientAvailable()) {
    const { data: admins } = await createAdminClient().from("profiles").select("user_id").eq("role", "admin").eq("active", true);
    await notifyUsers((admins ?? []).map((a) => a.user_id).filter((id) => id !== o.userId), {
      kind: "credit_note_to_approve", title: `Credit note to approve: ${made.join(", ")}`,
      body: `Made on order ${o.orderNumber}; applied to it as soon as you approve it.`, link: `/orders/${o.orderId}?tab=credit-notes`,
    }, true);
  }
  return { pending };
}

/** Credit notes of the client that can still be used (approved, USD, amount left) — RLS scopes the accounts. */
export async function loadAvailableCreditNotes(db: Db, accountId?: string) {
  let q = db.from("credit_notes").select("id, account_id, number, amount, currency, reason, rmas(number), credit_note_applications(amount_usd)")
    .in("status", ["approved", "issued", "applied"]).eq("currency", "USD").order("number");
  if (accountId) q = q.eq("account_id", accountId);
  const { data } = await q;
  const out: Record<string, AvailableCreditNote[]> = {};
  for (const c of data ?? []) {
    const used = ((c.credit_note_applications ?? []) as { amount_usd: number }[]).reduce((t, x) => t + Number(x.amount_usd), 0);
    const left = r2(Number(c.amount) - used);
    if (left <= 0) continue;
    (out[c.account_id] ??= []).push({ id: c.id, number: c.number, amount: Number(c.amount), left, reason: c.reason,
      rma: (c.rmas as unknown as { number: string } | null)?.number ?? null });
  }
  return out;
}
export type AvailableCreditNote = { id: string; number: string; amount: number; left: number; reason: string | null; rma: string | null };
