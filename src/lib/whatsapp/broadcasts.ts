import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { LeadStage, LeadTier, Market } from "@/lib/leads/constants";

type DB = SupabaseClient<Database>;
export type Segment = { tiers?: LeadTier[]; markets?: Market[]; stages?: LeadStage[] };

export const US_MARKETING_SKIP = "US (+1) numbers do not receive marketing templates (Meta pause since April 2025)";

// Leads that may receive a broadcast: phone present, WhatsApp opt-in, not disqualified (brief §9).
export async function segmentLeads(db: DB, segment: Segment) {
  let q = db.from("leads").select("id, phone_e164, company, contact_name")
    .not("phone_e164", "is", null).eq("whatsapp_opt_in", true).eq("disqualified", false).limit(10000);
  if (segment.tiers?.length) q = q.in("tier", segment.tiers);
  if (segment.markets?.length) q = q.in("market", segment.markets);
  if (segment.stages?.length) q = q.in("stage", segment.stages);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function planRecipients(leads: { id: string; phone_e164: string | null }[], category: string) {
  const seen = new Set<string>();
  const rows: { lead_id: string; phone: string; status: "queued" | "skipped"; skip_reason: string | null }[] = [];
  for (const l of leads) {
    if (!l.phone_e164 || seen.has(l.phone_e164)) continue;
    seen.add(l.phone_e164);
    const usMarketing = category.toUpperCase() === "MARKETING" && l.phone_e164.startsWith("+1");
    rows.push({ lead_id: l.id, phone: l.phone_e164, status: usMarketing ? "skipped" : "queued", skip_reason: usMarketing ? US_MARKETING_SKIP : null });
  }
  return rows;
}
