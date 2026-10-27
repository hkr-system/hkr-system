"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";
import { listNumbers, listTemplates, numberHealth, registerNumber, subscribeAppToWaba, wabaId, whatsappConfigured } from "@/lib/whatsapp/graph";
import { ensureConversation, graphVersion, sendFileMessage, sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/service";
import { fillBody } from "@/lib/whatsapp/templates";
import { notifyUsers } from "@/lib/notify";

export type WaState = { ok?: boolean; error?: string; message?: string };

const STAFF = ["admin", "bd", "account_specialist"] as const;
const err = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });

function refresh() {
  revalidatePath("/whatsapp", "layout");
}

export async function sendText(_p: WaState, fd: FormData): Promise<WaState> {
  const user = await requireRole(STAFF);
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "Write a message first." };
  try {
    await sendTextMessage(await createClient(), user.id, String(fd.get("conversation_id")), body);
    refresh();
    return { ok: true };
  } catch (e) {
    refresh();
    return err(e);
  }
}

export async function sendTemplate(_p: WaState, fd: FormData): Promise<WaState> {
  const user = await requireRole(STAFF);
  const db = await createClient();
  const { data: tpl } = await db.from("wa_templates").select("name, language, category, components, status")
    .eq("id", String(fd.get("template_id"))).maybeSingle();
  if (!tpl) return { error: "Pick a template." };
  if (tpl.status !== "APPROVED") return { error: "Only templates approved by Meta can be sent." };
  const values = fd.getAll("var").map((v) => String(v).trim());
  if (values.some((v) => !v)) return { error: "Fill in every variable." };
  try {
    await sendTemplateMessage(db, user.id, String(fd.get("conversation_id")), tpl, values, undefined, fillBody(tpl.components, values));
    refresh();
    return { ok: true };
  } catch (e) {
    refresh();
    return err(e);
  }
}

export async function sendFile(_p: WaState, fd: FormData): Promise<WaState> {
  const user = await requireRole(STAFF);
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a file." };
  if (file.size > 100 * 1024 * 1024) return { error: "Files up to 100 MB." };
  const conversationId = String(fd.get("conversation_id"));
  try {
    await sendFileMessage(await createClient(), user.id, conversationId, file, String(fd.get("caption") ?? "").trim(),
      async (bytes, name, mime) => {
        // Server-side upload to the private bucket (users never get direct bucket access).
        const path = `${conversationId}/${Date.now()}-${name.replace(/[^\w.\-]+/g, "_")}`;
        if (adminClientAvailable()) {
          const { error } = await createAdminClient().storage.from("wa-media").upload(path, bytes, { contentType: mime });
          if (error) throw new Error(error.message);
        }
        return path;
      });
    refresh();
    return { ok: true };
  } catch (e) {
    refresh();
    return err(e);
  }
}

export async function assignConversation(_p: WaState, fd: FormData): Promise<WaState> {
  const user = await requireRole(STAFF);
  const id = String(fd.get("conversation_id"));
  const assignee = String(fd.get("assigned_user_id") ?? "") || null;
  const db = await createClient();
  const { error } = await db.from("wa_conversations").update({ assigned_user_id: assignee }).eq("id", id);
  if (error) return { error: error.message };
  if (assignee && assignee !== user.id) {
    await notifyUsers([assignee], { kind: "wa_assigned", title: `${user.fullName} assigned you a WhatsApp conversation`, link: `/whatsapp?c=${id}` });
  }
  refresh();
  return { ok: true };
}

export async function setConversationStatus(id: string, status: "open" | "pending" | "resolved"): Promise<WaState> {
  await requireRole(STAFF);
  const db = await createClient();
  const { error } = await db.from("wa_conversations").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function startConversation(_p: WaState, fd: FormData): Promise<WaState> {
  await requireRole(STAFF);
  const db = await createClient();
  const leadId = String(fd.get("lead_id"));
  const numberId = String(fd.get("wa_number_id") ?? "");
  if (!numberId) return { error: "Pick the number to write from." };
  const { data: lead } = await db.from("leads").select("id, phone_e164, contact_name").eq("id", leadId).maybeSingle();
  if (!lead?.phone_e164) return { error: "This lead has no WhatsApp number." };
  let id: string;
  try {
    id = await ensureConversation(db, numberId, lead.phone_e164, lead.id, lead.contact_name);
  } catch (e) {
    return err(e);
  }
  redirect(`/whatsapp?c=${id}`);
}

// --- admin: templates and numbers ------------------------------------------

export async function syncTemplates(): Promise<WaState> {
  await requireRole(["admin"]);
  if (!whatsappConfigured() || !wabaId()) return { error: "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_WABA_ID in Vercel first." };
  const db = await createClient();
  try {
    const list = await listTemplates(await graphVersion(db), wabaId());
    for (const t of list) {
      const { error } = await db.from("wa_templates").upsert({
        meta_id: t.id, name: t.name, language: t.language, category: t.category, status: t.status,
        components: t.components as never, synced_at: new Date().toISOString(),
      }, { onConflict: "name,language" });
      if (error) return { error: error.message };
    }
    const names = new Set(list.map((t) => `${t.name}|${t.language}`));
    const { data: local } = await db.from("wa_templates").select("id, name, language");
    for (const l of local ?? []) {
      if (!names.has(`${l.name}|${l.language}`)) await db.from("wa_templates").update({ status: "DELETED_IN_META" }).eq("id", l.id);
    }
    refresh();
    return { ok: true, message: `${list.length} templates synced from Meta.` };
  } catch (e) {
    return err(e);
  }
}

export async function importNumbers(): Promise<WaState> {
  await requireRole(["admin"]);
  if (!whatsappConfigured() || !wabaId()) return { error: "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_WABA_ID in Vercel first." };
  const db = await createClient();
  try {
    const v = await graphVersion(db);
    // make sure Meta delivers this account's incoming messages to our webhook
    const sub = await subscribeAppToWaba(v, wabaId());
    const { data } = await listNumbers(v, wabaId());
    for (const n of data) {
      const phone = `+${n.display_phone_number.replace(/[^0-9]/g, "")}`;
      const { data: row } = await db.from("wa_numbers").select("id").eq("phone_number_id", n.id).maybeSingle();
      if (row) await db.from("wa_numbers").update({ display_phone: phone, verified_name: n.verified_name ?? null }).eq("id", row.id);
      else await db.from("wa_numbers").insert({ phone_number_id: n.id, display_phone: phone, verified_name: n.verified_name ?? null, label: "New number" });
    }
    refresh();
    return { ok: true, message: `${data.length} numbers found in Meta. Incoming messages: ${sub.success ? "connected" : "check the webhook in Meta"}.` };
  } catch (e) {
    return err(e);
  }
}

export async function refreshNumberHealth(id: string): Promise<WaState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const { data: n } = await db.from("wa_numbers").select("id, phone_number_id, is_demo").eq("id", id).maybeSingle();
  if (!n || n.is_demo) return { error: "Demo numbers have no Meta data." };
  try {
    const h = await numberHealth(await graphVersion(db), n.phone_number_id);
    const red = h.quality_rating === "RED";
    await db.from("wa_numbers").update({
      quality_rating: h.quality_rating ?? null, messaging_tier: h.messaging_limit_tier ?? null,
      verified_name: h.verified_name ?? null, quality_checked_at: new Date().toISOString(),
      ...(red ? { broadcasts_paused: true, paused_reason: "Quality rating Low (RED): broadcasts paused automatically" } : {}),
    }).eq("id", n.id);
    refresh();
    const meta = [h.status && `Meta status ${h.status}`, h.name_status && `name ${h.name_status}`].filter(Boolean).join(" · ");
    return { ok: true, message: meta ? `Done. ${meta}.` : "Done." };
  } catch (e) {
    return err(e);
  }
}

export async function registerNumberForApi(_p: WaState, fd: FormData): Promise<WaState> {
  await requireRole(["admin"]);
  const pin = String(fd.get("pin") ?? "").trim();
  if (!/^\d{6}$/.test(pin)) return { error: "The PIN must be exactly 6 digits." };
  const db = await createClient();
  const { data: n } = await db.from("wa_numbers").select("phone_number_id, is_demo").eq("id", String(fd.get("id"))).maybeSingle();
  if (!n || n.is_demo) return { error: "Demo numbers cannot be registered." };
  try {
    await registerNumber(await graphVersion(db), n.phone_number_id, pin);
    return { ok: true, message: "Registered: this number can now send and receive through the system. Keep the PIN safe." };
  } catch (e) {
    return err(e);
  }
}

export async function updateNumber(_p: WaState, fd: FormData): Promise<WaState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const limit = Number(fd.get("daily_broadcast_limit"));
  if (!Number.isInteger(limit) || limit < 0) return { error: "Daily limit must be a whole number." };
  const market = String(fd.get("market") ?? "");
  const paused = fd.get("broadcasts_paused") === "on";
  const { error } = await db.from("wa_numbers").update({
    label: String(fd.get("label") ?? "").trim() || null,
    market: (["EU", "LATAM", "US", "ROW"].includes(market) ? market : null) as never,
    daily_broadcast_limit: limit,
    broadcasts_paused: paused,
    paused_reason: paused ? (String(fd.get("paused_reason") ?? "").trim() || "Paused by admin") : null,
    active: fd.get("active") === "on",
  }).eq("id", String(fd.get("id")));
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function updateNumberByMarket(_p: WaState, fd: FormData): Promise<WaState> {
  await requireRole(["admin"]);
  const value: Record<string, string | null> = {};
  for (const m of ["EU", "LATAM", "US", "ROW"]) {
    const v = String(fd.get(m) ?? "");
    value[m] = /^[0-9a-f-]{36}$/.test(v) ? v : null;
  }
  const { error } = await (await createClient()).from("settings").update({ value }).eq("key", "wa_number_by_market");
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// --- notifications -----------------------------------------------------------

export async function markNotificationRead(id: string) {
  await requireRole(STAFF);
  await (await createClient()).from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const user = await requireRole(STAFF);
  await (await createClient()).from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id).is("read_at", null);
  revalidatePath("/", "layout");
}
