import "server-only";
import { brevoEnabled } from "@/lib/brevo";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";

type Note = { kind: string; title: string; body?: string; link?: string };

async function sendEmail(to: { email: string; name: string }, subject: string, html: string) {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "email_sender").maybeSingle();
  const sender = (data?.value ?? { email: "noreply@hk-refurbished-stock.com", name: "HKR System" }) as { email: string; name: string };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY ?? "", "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender, to: [to], subject, htmlContent: html }),
  });
  if (!res.ok) throw new Error(`Brevo email failed (${res.status})`);
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// In-app notification (bell) + email when Brevo is configured. Never throws.
export async function notifyUsers(userIds: string[], note: Note, email = false) {
  if (!adminClientAvailable() || !userIds.length) return;
  const db = createAdminClient();
  const { data: rows } = await db.from("notifications")
    .insert(userIds.map((user_id) => ({ user_id, ...note }))).select("id, user_id");
  if (!email || !brevoEnabled()) return;
  const { data: people } = await db.from("profiles").select("user_id, email, full_name").in("user_id", userIds);
  const { data: base } = await db.from("settings").select("value").eq("key", "app_base_url").maybeSingle();
  const url = `${typeof base?.value === "string" ? base.value : ""}${note.link ?? ""}`;
  for (const p of people ?? []) {
    try {
      await sendEmail({ email: p.email, name: p.full_name || p.email }, note.title,
        `<p>${escape(note.title)}</p>${note.body ? `<p>${escape(note.body)}</p>` : ""}<p><a href="${escape(url)}">Open in HKR System</a></p>`);
      const id = rows?.find((r) => r.user_id === p.user_id)?.id;
      if (id) await db.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", id);
    } catch (e) {
      console.error("notification email failed", e);
    }
  }
}

// Brief §10 Phase 2: "stage change to Qualified → owner notified" (in app + email, decided Oct 2026).
// No owner yet → every active admin and bd user is told (same rule as unassigned conversations).
export async function notifyLeadQualified(leadId: string) {
  if (!adminClientAvailable()) return;
  const db = createAdminClient();
  const { data: lead } = await db.from("leads").select("id, company, owner_user_id, tier, score").eq("id", leadId).maybeSingle();
  if (!lead) return;
  let ids = lead.owner_user_id ? [lead.owner_user_id] : [];
  if (!ids.length) {
    const { data } = await db.from("profiles").select("user_id").eq("active", true).in("role", ["admin", "bd"]);
    ids = (data ?? []).map((p) => p.user_id);
  }
  await notifyUsers(ids, {
    kind: "lead_qualified",
    title: `Lead qualified: ${lead.company}`,
    body: `Tier ${lead.tier ?? "—"}, score ${lead.score}.${lead.owner_user_id ? "" : " No owner yet."}`,
    link: `/leads/${lead.id}`,
  }, true);
}
