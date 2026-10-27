import { NextResponse, type NextRequest } from "next/server";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";
import { numberHealth, whatsappConfigured } from "@/lib/whatsapp/graph";
import { ensureConversation, graphVersion, sendTemplateMessage } from "@/lib/whatsapp/service";
import { fillBody, resolveVariables, type VariableSource } from "@/lib/whatsapp/templates";

// Called every minute by Supabase cron (public.wa_worker_tick) with "Authorization: Bearer <CRON_SECRET>".
// 1. starts approved broadcasts whose time has come; 2. sends queued recipients, never more per
// number per 24 h than its daily_broadcast_limit; 3. once a day checks each number's quality and
// pauses broadcasts when Meta rates it Low (RED) — brief §9.
export const maxDuration = 60;
const PER_TICK = 30;

export async function POST(request: NextRequest) {
  return run(request);
}
export async function GET(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminClientAvailable()) return NextResponse.json({ skipped: "SUPABASE_SECRET_KEY not set" });
  const db = createAdminClient();
  const now = new Date();
  const summary = { started: 0, sent: 0, failed: 0, finished: 0, healthChecked: 0, paused: 0 };

  // 1. due broadcasts → sending
  const { data: due } = await db.from("wa_broadcasts").select("id").eq("status", "approved").lte("scheduled_at", now.toISOString());
  for (const b of due ?? []) {
    await db.from("wa_broadcasts").update({ status: "sending" }).eq("id", b.id);
    summary.started++;
  }

  // 2. send
  if (whatsappConfigured()) {
    const { data: sending } = await db.from("wa_broadcasts")
      .select("id, created_by, wa_number_id, variables, header_media_id, header_filename, wa_numbers(id, broadcasts_paused, active, is_demo, daily_broadcast_limit), wa_templates(name, language, category, components, status)")
      .eq("status", "sending");
    const sinceIso = new Date(now.getTime() - 24 * 3600_000).toISOString();
    for (const b of sending ?? []) {
      const num = (Array.isArray(b.wa_numbers) ? b.wa_numbers[0] : b.wa_numbers) as { id: string; broadcasts_paused: boolean; active: boolean; is_demo: boolean; daily_broadcast_limit: number } | null;
      const tpl = (Array.isArray(b.wa_templates) ? b.wa_templates[0] : b.wa_templates) as { name: string; language: string; category: string; components: unknown; status: string } | null;
      if (!num || !tpl || num.broadcasts_paused || !num.active || num.is_demo || tpl.status !== "APPROVED") continue;

      const { data: sameNumber } = await db.from("wa_broadcasts").select("id").eq("wa_number_id", num.id);
      const { count: usedToday } = await db.from("wa_broadcast_recipients").select("id", { count: "exact", head: true })
        .in("broadcast_id", (sameNumber ?? []).map((x) => x.id)).gte("sent_at", sinceIso);
      const room = Math.max(0, num.daily_broadcast_limit - (usedToday ?? 0));
      if (!room) continue;

      const { data: queue } = await db.from("wa_broadcast_recipients")
        .select("id, phone, lead_id, leads(company, contact_name, whatsapp_opt_in)")
        .eq("broadcast_id", b.id).eq("status", "queued").limit(Math.min(room, PER_TICK));
      for (const r of queue ?? []) {
        const lead = (Array.isArray(r.leads) ? r.leads[0] : r.leads) as { company: string; contact_name: string | null; whatsapp_opt_in: boolean } | null;
        if (lead && !lead.whatsapp_opt_in) {
          await db.from("wa_broadcast_recipients").update({ status: "skipped", skip_reason: "Opted out before sending" }).eq("id", r.id);
          continue;
        }
        const values = resolveVariables((b.variables ?? []) as VariableSource[], lead ?? {});
        const headerMedia = b.header_media_id ? { id: b.header_media_id, filename: b.header_filename ?? undefined } : undefined;
        try {
          const conv = await ensureConversation(db, num.id, r.phone, r.lead_id, lead?.contact_name);
          const messageId = await sendTemplateMessage(db, b.created_by, conv, tpl, values, headerMedia, fillBody(tpl.components, values), b.id);
          await db.from("wa_broadcast_recipients").update({ status: "sent", message_id: messageId, sent_at: new Date().toISOString() }).eq("id", r.id);
          summary.sent++;
        } catch (e) {
          await db.from("wa_broadcast_recipients").update({
            status: "failed", error_title: e instanceof Error ? e.message : String(e), sent_at: new Date().toISOString(),
          }).eq("id", r.id);
          summary.failed++;
        }
      }
      const { count: left } = await db.from("wa_broadcast_recipients").select("id", { count: "exact", head: true })
        .eq("broadcast_id", b.id).eq("status", "queued");
      if (!left) {
        await db.from("wa_broadcasts").update({ status: "done" }).eq("id", b.id);
        summary.finished++;
      }
      await db.rpc("wa_refresh_broadcast_counts", { p_id: b.id });
    }
  }

  // keep counters fresh for broadcasts still receiving delivery/read statuses (last 3 days)
  const { data: recent } = await db.from("wa_broadcasts").select("id").in("status", ["sending", "done"])
    .gte("updated_at", new Date(now.getTime() - 3 * 86400_000).toISOString());
  for (const b of recent ?? []) await db.rpc("wa_refresh_broadcast_counts", { p_id: b.id });

  // 3. daily quality check
  if (whatsappConfigured()) {
    const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const { data: numbers } = await db.from("wa_numbers").select("id, phone_number_id, quality_checked_at")
      .eq("is_demo", false).eq("active", true).or(`quality_checked_at.is.null,quality_checked_at.lt.${dayAgo}`).limit(10);
    const v = numbers?.length ? await graphVersion(db) : "v25.0";
    for (const n of numbers ?? []) {
      try {
        const h = await numberHealth(v, n.phone_number_id);
        const red = h.quality_rating === "RED";
        await db.from("wa_numbers").update({
          quality_rating: h.quality_rating ?? null, messaging_tier: h.messaging_limit_tier ?? null,
          verified_name: h.verified_name ?? null, quality_checked_at: now.toISOString(),
          ...(red ? { broadcasts_paused: true, paused_reason: "Quality rating Low (RED): broadcasts paused automatically" } : {}),
        }).eq("id", n.id);
        summary.healthChecked++;
        if (red) summary.paused++;
      } catch (e) {
        await db.from("wa_numbers").update({ quality_checked_at: now.toISOString() }).eq("id", n.id);
        console.error("health check failed", e);
      }
    }
  }
  return NextResponse.json(summary);
}
