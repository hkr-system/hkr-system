import "server-only";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";
import { whatsappConfigured } from "./graph";
import { ensureConversation, numberForMarket, resolveVariables, sendTemplateMessage } from "./service";
import { bodyVariableCount, fillBody } from "./templates";

// Event hooks (brief §10 Phase 2 item 4). Active now: welcome template for /apply leads.
// Ready for later phases (they do nothing until those modules call them):
//   onOrderStatusChange (Phase 3), sendThursdayUpdate (Phase 5), sendRmaReminder (Phase 4).

async function sendTemplateToLead(leadId: string, templateName: string, languageFor: (lang: string) => string) {
  if (!adminClientAvailable() || !whatsappConfigured() || !templateName) return "skipped";
  const db = createAdminClient();
  const { data: lead } = await db.from("leads")
    .select("id, company, contact_name, phone_e164, market, language, whatsapp_opt_in").eq("id", leadId).maybeSingle();
  if (!lead?.phone_e164 || !lead.whatsapp_opt_in) return "skipped";
  const numberId = await numberForMarket(db, lead.market);
  if (!numberId) return "skipped";
  const language = languageFor(lead.language);
  const { data: tpl } = await db.from("wa_templates").select("name, language, category, components, status")
    .eq("name", templateName).eq("language", language).maybeSingle();
  if (!tpl || tpl.status !== "APPROVED") return "skipped";
  const conv = await ensureConversation(db, numberId, lead.phone_e164, lead.id, lead.contact_name);
  const n = bodyVariableCount(tpl.components);
  const values = resolveVariables(Array.from({ length: n }, (_, i) => ({ source: i === 0 ? "first_name" : "company" } as const)), lead);
  try {
    await sendTemplateMessage(db, null, conv, tpl, values, undefined, fillBody(tpl.components, values));
    return "sent";
  } catch (e) {
    console.error("automation send failed", e);
    return "failed";
  }
}

export async function onFormSubmission(leadId: string) {
  if (!adminClientAvailable()) return "skipped";
  const db = createAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "wa_welcome_template").maybeSingle();
  const cfg = (data?.value ?? {}) as { name?: string; language_en?: string; language_es?: string };
  if (!cfg.name) return "skipped"; // no welcome template yet (Oct 2026)
  return sendTemplateToLead(leadId, cfg.name, (lang) => (lang === "es" ? cfg.language_es || "es" : cfg.language_en || "en"));
}

// Hooks for later phases: wired in Phases 3–5.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function onOrderStatusChange(orderId: string, status: string) { return "not-active-yet" as const; }
export async function sendThursdayUpdate(orderId: string) { return "not-active-yet" as const; }
export async function sendRmaReminder(accountId: string) { return "not-active-yet" as const; }
/* eslint-enable @typescript-eslint/no-unused-vars */
