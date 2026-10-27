"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { zonedToUtc } from "@/lib/format";
import { MARKETS, STAGES, TIERS, type LeadStage, type LeadTier, type Market } from "@/lib/leads/constants";
import { uploadMedia, whatsappConfigured } from "@/lib/whatsapp/graph";
import { graphVersion } from "@/lib/whatsapp/service";
import { headerFormat } from "@/lib/whatsapp/templates";
import { planRecipients, segmentLeads, type Segment } from "@/lib/whatsapp/broadcasts";

export type BcState = { error?: string; ok?: boolean; message?: string };
const WORKERS = ["admin", "bd"] as const;

function readSegment(fd: FormData): Segment {
  return {
    tiers: fd.getAll("tiers").map(String).filter((t) => (TIERS as readonly string[]).includes(t)) as LeadTier[],
    markets: fd.getAll("markets").map(String).filter((m) => (MARKETS as readonly string[]).includes(m)) as Market[],
    stages: fd.getAll("stages").map(String).filter((s) => (STAGES as readonly string[]).includes(s)) as LeadStage[],
  };
}

export async function previewAudience(segment: Segment, templateId: string) {
  await requireRole(WORKERS);
  const db = await createClient();
  const { data: tpl } = await db.from("wa_templates").select("category").eq("id", templateId).maybeSingle();
  const rows = planRecipients(await segmentLeads(db, segment), tpl?.category ?? "UTILITY");
  return { queued: rows.filter((r) => r.status === "queued").length, skipped: rows.filter((r) => r.status === "skipped").length };
}

export async function createBroadcast(_p: BcState, fd: FormData): Promise<BcState> {
  const user = await requireRole(WORKERS);
  const db = await createClient();
  const name = String(fd.get("name") ?? "").trim();
  const numberId = String(fd.get("wa_number_id") ?? "");
  const templateId = String(fd.get("template_id") ?? "");
  if (!name || !numberId || !templateId) return { error: "Name, number and template are required." };
  const [{ data: tpl }, { data: number }] = await Promise.all([
    db.from("wa_templates").select("id, category, components, status").eq("id", templateId).maybeSingle(),
    db.from("wa_numbers").select("id, phone_number_id, is_demo").eq("id", numberId).maybeSingle(),
  ]);
  if (!tpl || tpl.status !== "APPROVED") return { error: "Pick an approved template." };
  if (!number) return { error: "Pick a number." };

  const variables = fd.getAll("var_source").map((s, i) => ({ source: String(s), value: String(fd.getAll("var_value")[i] ?? "") }));
  if (variables.some((v) => v.source === "text" && !v.value.trim())) return { error: "Fill in every fixed-text variable." };

  let headerMediaId: string | null = null;
  let headerFilename: string | null = null;
  const fmt = headerFormat(tpl.components);
  if (fmt && fmt !== "TEXT") {
    const file = fd.get("header_file");
    if (!(file instanceof File) || !file.size) return { error: `This template needs a ${fmt.toLowerCase()} for its header.` };
    if (number.is_demo || !whatsappConfigured()) return { error: "The header file can only be uploaded through a connected number." };
    try {
      headerMediaId = await uploadMedia(await graphVersion(db), number.phone_number_id, file, file.name);
      headerFilename = file.name;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  const when = String(fd.get("scheduled_local") ?? "").trim();
  const segment = readSegment(fd);
  const { data: bc, error } = await db.from("wa_broadcasts").insert({
    name, wa_number_id: number.id, template_id: tpl.id, segment: segment as never, variables: variables as never,
    header_media_id: headerMediaId, header_filename: headerFilename,
    scheduled_at: when ? zonedToUtc(when, user.timezone) : null, status: "draft",
  }).select("id").single();
  if (error || !bc) return { error: error?.message ?? "Could not save." };

  const rows = planRecipients(await segmentLeads(db, segment), tpl.category);
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await db.from("wa_broadcast_recipients").insert(rows.slice(i, i + 500).map((r) => ({ ...r, broadcast_id: bc.id })));
    if (e) return { error: e.message };
  }
  await db.rpc("wa_refresh_broadcast_counts", { p_id: bc.id });
  revalidatePath("/whatsapp/broadcasts");
  redirect(`/whatsapp/broadcasts/${bc.id}`);
}

async function setStatus(id: string, status: "pending_approval" | "approved" | "cancelled" | "paused" | "sending" | "draft") {
  const db = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "approved") {
    const { data } = await db.from("wa_broadcasts").select("scheduled_at").eq("id", id).maybeSingle();
    if (!data?.scheduled_at) patch.scheduled_at = new Date().toISOString();
  }
  const { error } = await db.from("wa_broadcasts").update(patch as never).eq("id", id);
  revalidatePath(`/whatsapp/broadcasts/${id}`);
  revalidatePath("/whatsapp/broadcasts");
  return error ? { error: error.message.includes("Only an admin") ? "Only an admin can approve or send a broadcast." : error.message } : { ok: true };
}

export async function submitForApproval(id: string): Promise<BcState> {
  await requireRole(WORKERS);
  return setStatus(id, "pending_approval");
}
export async function approveBroadcast(id: string): Promise<BcState> {
  await requireRole(["admin"]);
  return setStatus(id, "approved");
}
export async function cancelBroadcast(id: string): Promise<BcState> {
  await requireRole(WORKERS);
  return setStatus(id, "cancelled");
}
export async function pauseBroadcast(id: string): Promise<BcState> {
  await requireRole(["admin"]);
  return setStatus(id, "paused");
}
export async function resumeBroadcast(id: string): Promise<BcState> {
  await requireRole(["admin"]);
  return setStatus(id, "sending");
}
