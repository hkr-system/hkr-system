import { NextResponse, type NextRequest } from "next/server";
import { brevoEnabled, unsubscribedSince } from "@/lib/brevo";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";

// Nightly job (vercel.json): marks leads that unsubscribed in Brevo as email_opt_out.
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!brevoEnabled() || !adminClientAvailable()) {
    return NextResponse.json({ skipped: "BREVO_API_KEY or SUPABASE_SECRET_KEY not set" });
  }

  const db = createAdminClient();
  const { data: setting } = await db.from("settings").select("value").eq("key", "brevo_unsubscribes_synced_at").maybeSingle();
  const last = typeof setting?.value === "string" ? new Date(setting.value) : new Date(Date.now() - 30 * 86400_000);
  const startedAt = new Date().toISOString();

  const emails = await unsubscribedSince(last);
  let marked = 0;
  for (let i = 0; i < emails.length; i += 300) {
    const { data } = await db
      .from("leads")
      .update({ email_opt_out: true })
      .in("email", emails.slice(i, i + 300))
      .eq("email_opt_out", false)
      .select("id");
    for (const l of data ?? []) {
      await db.from("lead_events").insert({ lead_id: l.id, kind: "email", body: "Unsubscribed from emails in Brevo.", user_id: null });
    }
    marked += data?.length ?? 0;
  }
  await db.from("settings").update({ value: startedAt }).eq("key", "brevo_unsubscribes_synced_at");
  return NextResponse.json({ checked: emails.length, marked });
}
