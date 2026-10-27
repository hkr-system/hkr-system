import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { GraphError, sendMedia, sendTemplate, sendText, uploadMedia, whatsappConfigured } from "./graph";
import { buildComponents, costCategory, resolveVariables, windowOpen, type VariableSource } from "./templates";

type DB = SupabaseClient<Database>;

export async function graphVersion(db: DB) {
  const { data } = await db.from("settings").select("value").eq("key", "wa_graph_version").maybeSingle();
  return typeof data?.value === "string" ? data.value : "v25.0";
}

export async function numberForMarket(db: DB, market: string | null) {
  const { data } = await db.from("settings").select("value").eq("key", "wa_number_by_market").maybeSingle();
  const map = (data?.value ?? {}) as Record<string, string | null>;
  return (market && map[market]) || null;
}

type ConversationRow = {
  id: string; contact_phone: string; last_inbound_at: string | null; lead_id: string | null;
  wa_numbers: { id: string; phone_number_id: string; is_demo: boolean; active: boolean } | null;
};

async function loadConversation(db: DB, id: string): Promise<ConversationRow> {
  const { data } = await db
    .from("wa_conversations")
    .select("id, contact_phone, last_inbound_at, lead_id, wa_numbers(id, phone_number_id, is_demo, active)")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("Conversation not found or not visible to you.");
  return data as unknown as ConversationRow;
}

function checkNumber(c: ConversationRow) {
  if (!c.wa_numbers) throw new Error("This conversation has no WhatsApp number.");
  if (c.wa_numbers.is_demo) throw new Error("This is a demo number: messages cannot be sent from it.");
  if (!c.wa_numbers.active) throw new Error("This number is switched off.");
  if (!whatsappConfigured()) throw new Error("WhatsApp is not connected yet (ask the admin to add the access token).");
  return c.wa_numbers.phone_number_id;
}

type Outbound = Database["public"]["Tables"]["wa_messages"]["Insert"];

async function record(db: DB, row: Outbound) {
  const { data, error } = await db.from("wa_messages").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

function failure(e: unknown) {
  return e instanceof GraphError ? e.message : e instanceof Error ? e.message : String(e);
}

// Free-form text: only inside the 24-hour window (Meta rule, brief §9).
export async function sendTextMessage(db: DB, userId: string, conversationId: string, body: string) {
  const c = await loadConversation(db, conversationId);
  if (!windowOpen(c.last_inbound_at)) throw new Error("The 24-hour window is closed: send an approved template instead.");
  const pnid = checkNumber(c);
  const v = await graphVersion(db);
  try {
    const wamid = await sendText(v, pnid, c.contact_phone, body);
    return record(db, { conversation_id: c.id, direction: "outbound", type: "text", body, meta_message_id: wamid,
      status: "sent", cost_category: "service", sent_by: userId, sent_at: new Date().toISOString() });
  } catch (e) {
    await record(db, { conversation_id: c.id, direction: "outbound", type: "text", body, status: "failed",
      error_title: failure(e), cost_category: "none", sent_by: userId });
    throw new Error(failure(e));
  }
}

export async function sendTemplateMessage(
  db: DB, userId: string | null, conversationId: string,
  template: { name: string; language: string; category: string; components: unknown },
  variables: string[], headerMedia?: { id: string; filename?: string }, preview?: string, broadcastId?: string,
) {
  const c = await loadConversation(db, conversationId);
  const pnid = checkNumber(c);
  const v = await graphVersion(db);
  const base: Outbound = {
    conversation_id: c.id, direction: "outbound", type: "template", body: preview ?? null,
    template_name: template.name, template_language: template.language, sent_by: userId,
    broadcast_id: broadcastId ?? null, media_id: headerMedia?.id ?? null, media_filename: headerMedia?.filename ?? null,
    cost_category: "none", status: "failed",
  };
  try {
    const wamid = await sendTemplate(v, pnid, c.contact_phone, template.name, template.language,
      buildComponents(template.components, variables, headerMedia));
    // Inside an open window utility templates are free; we still log the category Meta bills by.
    return record(db, { ...base, meta_message_id: wamid, status: "sent", cost_category: costCategory(template.category),
      sent_at: new Date().toISOString() });
  } catch (e) {
    await record(db, { ...base, error_title: failure(e) });
    throw new Error(failure(e));
  }
}

export async function sendFileMessage(db: DB, userId: string, conversationId: string, file: File, caption: string,
  storePath: (bytes: ArrayBuffer, name: string, mime: string) => Promise<string>) {
  const c = await loadConversation(db, conversationId);
  if (!windowOpen(c.last_inbound_at)) {
    throw new Error("The 24-hour window is closed: files can only be sent inside it (or as a template header).");
  }
  const pnid = checkNumber(c);
  const v = await graphVersion(db);
  const mime = file.type || "application/octet-stream";
  const kind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
  const bytes = await file.arrayBuffer();
  const path = await storePath(bytes, file.name, mime);
  try {
    const mediaId = await uploadMedia(v, pnid, new Blob([bytes], { type: mime }), file.name);
    const wamid = await sendMedia(v, pnid, c.contact_phone, kind, mediaId, file.name, caption || undefined);
    return record(db, { conversation_id: c.id, direction: "outbound", type: kind, body: caption || file.name,
      media_id: mediaId, media_mime: mime, media_filename: file.name, media_path: path, meta_message_id: wamid,
      status: "sent", cost_category: "service", sent_by: userId, sent_at: new Date().toISOString() });
  } catch (e) {
    await record(db, { conversation_id: c.id, direction: "outbound", type: kind, body: caption || file.name,
      media_mime: mime, media_filename: file.name, media_path: path, status: "failed", error_title: failure(e),
      cost_category: "none", sent_by: userId });
    throw new Error(failure(e));
  }
}

// Finds or creates the conversation between one of our numbers and a phone.
export async function ensureConversation(db: DB, numberId: string, phone: string, leadId: string | null, name?: string | null) {
  const { data: existing } = await db.from("wa_conversations").select("id")
    .eq("wa_number_id", numberId).eq("contact_phone", phone).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await db.from("wa_conversations")
    .insert({ wa_number_id: numberId, contact_phone: phone, lead_id: leadId, contact_name: name ?? null })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export { resolveVariables, type VariableSource };
