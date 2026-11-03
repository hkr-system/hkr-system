"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn, zonedToUtc } from "@/lib/format";
import { weekStart } from "@/lib/dashboard/dates";
import { TOPICS } from "@/lib/dashboard/escalations";
import { notifyUsers } from "@/lib/notify";
import { createAdminClient, adminClientAvailable } from "@/lib/supabase/admin";

const STAFF = ["admin", "bd", "account_specialist"] as const;
export type QueueState = { ok?: boolean; error?: string; message?: string };

const UUID = /^[0-9a-f-]{36}$/;
function refreshAll() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/thursday");
  revalidatePath("/dashboard/report");
  revalidatePath("/dashboard/escalations");
}

/** "Mark as sent": the Thursday update, the RMA ask or a balance reminder (SOP P5, P9). The week is the Hong Kong week. */
export async function markUpdateSent(input: {
  account_id: string; kind: "thursday" | "rma_ask" | "balance_reminder"; order_ids?: string[]; message?: string;
  language?: "en" | "es"; channel?: "whatsapp" | "email" | "other";
}): Promise<QueueState> {
  await requireRole(STAFF);
  if (!UUID.test(input.account_id) || !["thursday", "rma_ask", "balance_reminder"].includes(input.kind)) return { error: "Unknown client." };
  const db = await createClient();
  const { error } = await db.from("client_updates").insert({
    account_id: input.account_id, kind: input.kind, week_start: weekStart(todayIn("Asia/Hong_Kong")),
    order_ids: (input.order_ids ?? []).filter((x) => UUID.test(x)), message: (input.message ?? "").slice(0, 5000),
    language: input.language === "es" ? "es" : "en", channel: input.channel ?? "whatsapp",
  });
  if (error) return { error: error.code === "42501" ? "You do not have access to this client." : error.message };
  refreshAll();
  return { ok: true, message: "Marked as sent." };
}

export async function undoUpdate(id: string): Promise<QueueState> {
  await requireRole(STAFF);
  if (!UUID.test(id)) return { error: "Unknown record." };
  const db = await createClient();
  const { error, count } = await db.from("client_updates").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { error: "Only the same day, by who marked it (or an admin)." };
  refreshAll();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Escalations (SOP P8, §3.5)
// ---------------------------------------------------------------------------
const text = (fd: FormData, k: string, max = 2000) => String(fd.get(k) ?? "").trim().slice(0, max) || null;

export async function createEscalation(_p: QueueState, fd: FormData): Promise<QueueState> {
  const user = await requireRole(STAFF);
  const account_id = String(fd.get("account_id") ?? "");
  if (!UUID.test(account_id)) return { error: "Choose the client." };
  const what = text(fd, "what_happened");
  if (!what) return { error: "Write what happened." };
  const topic = String(fd.get("topic") ?? "other");
  const order_id = String(fd.get("order_id") ?? "");
  const answerLocal = String(fd.get("answer_by") ?? "");
  const answer_by = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(answerLocal) ? zonedToUtc(answerLocal, user.timezone) : null;
  const db = await createClient();
  const { data, error } = await db.from("escalations").insert({
    account_id, order_id: UUID.test(order_id) ? order_id : null,
    topic: (TOPICS.some(([k]) => k === topic) ? topic : "other"),
    what_happened: what, evidence: text(fd, "evidence"), figures: text(fd, "figures"), client_asks: text(fd, "client_asks"),
    proposal: text(fd, "proposal"), answer_by,
  }).select("id, accounts(code)").single();
  if (error) return { error: error.code === "42501" ? "You do not have access to this client." : error.message };
  // the SD (every active admin) gets it in the bell — and by email once Brevo is connected
  if (adminClientAvailable()) {
    const { data: admins } = await createAdminClient().from("profiles").select("user_id").eq("role", "admin").eq("active", true);
    const code = (data.accounts as unknown as { code: string } | null)?.code ?? "";
    await notifyUsers((admins ?? []).map((a) => a.user_id).filter((id) => id !== user.id),
      { kind: "escalation", title: `For the SD: ${code} — ${what.slice(0, 80)}`, link: `/dashboard/escalations#e-${data.id}` }, true);
  }
  refreshAll();
  redirect(`/dashboard/escalations#e-${data.id}`);
}

export async function decideEscalation(_p: QueueState, fd: FormData): Promise<QueueState> {
  await requireRole(["admin"]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Unknown escalation." };
  const decision = text(fd, "decision");
  const close = fd.get("close") === "1";
  if (close && !decision) return { error: "Write the decision before closing." };
  const db = await createClient();
  const { data: row, error } = await db.from("escalations").update({ decision, status: close ? "closed" : "open" }).eq("id", id)
    .select("created_by, accounts(code)").single();
  if (error) return { error: error.message };
  if (close && row.created_by) {
    const code = (row.accounts as unknown as { code: string } | null)?.code ?? "";
    await notifyUsers([row.created_by], { kind: "escalation_answered", title: `The SD answered: ${code}`, body: decision ?? undefined, link: `/dashboard/escalations?status=closed#e-${id}` });
  }
  refreshAll();
  return { ok: true, message: close ? "Answered and closed." : "Saved." };
}

export async function reopenEscalation(id: string): Promise<QueueState> {
  await requireRole(["admin"]);
  if (!UUID.test(id)) return { error: "Unknown escalation." };
  const db = await createClient();
  const { error } = await db.from("escalations").update({ status: "open" }).eq("id", id);
  if (error) return { error: error.message };
  refreshAll();
  return { ok: true };
}
