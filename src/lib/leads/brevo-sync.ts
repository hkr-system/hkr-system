import "server-only";
import { brevoEnabled, createList, upsertContact } from "@/lib/brevo";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";

// Demo and reserved domains never go to Brevo.
const SKIP_DOMAINS = /@(example\.(com|org|net)|[^@]+\.(test|example|invalid|local))$/i;

export function brevoListName(stage: string, market: string | null, language: string) {
  // e.g. "Qualified-EU-EN", "Sample-Proposal-LATAM-ES" (brief §9)
  return `${stage.replace("/", "-")}-${market ?? "ROW"}-${language.toUpperCase()}`;
}

// Pushes the lead to the Brevo list for its stage × market × language and removes
// it from the other app lists. Never throws: problems are written to the timeline.
export async function syncLeadToBrevo(leadId: string): Promise<"synced" | "skipped" | "failed"> {
  if (!brevoEnabled() || !adminClientAvailable()) return "skipped";
  const db = createAdminClient();
  const { data: lead } = await db
    .from("leads")
    .select("id, email, contact_name, stage, market, language, email_opt_out")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.email || lead.email_opt_out || SKIP_DOMAINS.test(lead.email)) return "skipped";

  const listName = brevoListName(lead.stage, lead.market, lead.language);
  try {
    const { data: lists } = await db.from("brevo_lists").select("name, brevo_list_id");
    let listId = lists?.find((l) => l.name === listName)?.brevo_list_id ?? null;
    if (!listId) {
      listId = await createList(listName);
      await db.from("brevo_lists").insert({ name: listName, brevo_list_id: listId });
    }
    const [firstName, ...rest] = (lead.contact_name ?? "").trim().split(/\s+/);
    const contactId = await upsertContact({
      email: lead.email,
      firstName: firstName || null,
      lastName: rest.join(" ") || null,
      listId,
      unlinkListIds: (lists ?? []).map((l) => l.brevo_list_id),
    });
    await db
      .from("leads")
      .update({
        brevo_list: listName,
        brevo_synced_at: new Date().toISOString(),
        ...(contactId ? { brevo_contact_id: contactId } : {}),
      })
      .eq("id", lead.id);
    return "synced";
  } catch (e) {
    await db.from("lead_events").insert({
      lead_id: lead.id,
      kind: "brevo",
      body: `Brevo sync failed: ${e instanceof Error ? e.message : String(e)}`,
      user_id: null,
    });
    return "failed";
  }
}
