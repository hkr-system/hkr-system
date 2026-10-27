"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAGES, type LeadStage } from "@/lib/leads/constants";
import { buildLeadFields, scoreFields } from "@/lib/leads/record";
import { loadScoringConfig } from "@/lib/leads/service";
import { syncLeadToBrevo } from "@/lib/leads/brevo-sync";
import { notifyLeadQualified } from "@/lib/notify";

export type ActionState = { ok?: boolean; error?: string; message?: string };

const LEAD_WORKERS = ["admin", "bd"] as const;

function friendly(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return error.message.includes("phone")
      ? "Another lead already has this phone number."
      : "Another lead already has this email.";
  }
  if (error.code === "23514" && error.message.includes("lost")) return "Give a reason when marking a lead Lost.";
  return error.message;
}

function refresh(id?: string) {
  revalidatePath("/leads", "layout");
  if (id) revalidatePath(`/leads/${id}`);
}

export async function createLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(LEAD_WORKERS);
  const db = await createClient();
  const { fields, problems } = buildLeadFields(Object.fromEntries(formData));
  if (problems.length) return { error: problems.join(" ") };
  const config = await loadScoringConfig(db);
  const { columns } = scoreFields(fields, config);
  const owner = String(formData.get("owner_user_id") ?? "") || user.id;
  const { data, error } = await db
    .from("leads")
    .insert({ ...fields, ...columns, source: String(formData.get("source") || "manual"), owner_user_id: owner })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };
  await syncLeadToBrevo(data.id);
  refresh();
  redirect(`/leads/${data.id}`);
}

export async function updateLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(LEAD_WORKERS);
  const id = String(formData.get("id"));
  const db = await createClient();
  const { fields, problems } = buildLeadFields(Object.fromEntries(formData));
  if (problems.length) return { error: problems.join(" ") };
  const config = await loadScoringConfig(db);
  const { columns } = scoreFields(fields, config);
  const { error } = await db
    .from("leads")
    .update({
      ...fields,
      ...columns,
      source: String(formData.get("source") || "manual"),
      whatsapp_opt_in: formData.get("whatsapp_opt_in") === "on",
      email_opt_out: formData.get("email_opt_out") === "on",
    })
    .eq("id", id);
  if (error) return { error: friendly(error) };
  await syncLeadToBrevo(id);
  refresh(id);
  return { ok: true, message: `Saved. Score ${columns.score}, tier ${columns.tier}${columns.disqualified ? " (disqualified)" : ""}.` };
}

export async function changeStage(id: string, stage: LeadStage, lostReason?: string): Promise<ActionState> {
  await requireRole(LEAD_WORKERS);
  if (!STAGES.includes(stage)) return { error: "Unknown stage." };
  if (stage === "Lost" && !lostReason?.trim()) return { error: "Give a reason when marking a lead Lost." };
  const db = await createClient();
  const { data: before } = await db.from("leads").select("stage").eq("id", id).maybeSingle();
  const { error } = await db
    .from("leads")
    .update({ stage, lost_reason: stage === "Lost" ? lostReason!.trim() : null })
    .eq("id", id);
  if (error) return { error: friendly(error) };
  if (stage === "Qualified" && before?.stage !== "Qualified") await notifyLeadQualified(id);
  await syncLeadToBrevo(id);
  refresh(id);
  return { ok: true };
}

export async function changeStageForm(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return changeStage(String(formData.get("id")), String(formData.get("stage")) as LeadStage, String(formData.get("lost_reason") ?? ""));
}

export async function assignOwner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(LEAD_WORKERS);
  const id = String(formData.get("id"));
  const owner = String(formData.get("owner_user_id") ?? "");
  const db = await createClient();
  const { error } = await db.from("leads").update({ owner_user_id: owner || null }).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh(id);
  return { ok: true };
}

export async function takeLead(id: string): Promise<ActionState> {
  const user = await requireRole(LEAD_WORKERS);
  const db = await createClient();
  const { error } = await db.from("leads").update({ owner_user_id: user.id }).eq("id", id).is("owner_user_id", null);
  if (error) return { error: friendly(error) };
  refresh(id);
  return { ok: true };
}

export async function setNextAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(LEAD_WORKERS);
  const id = String(formData.get("id"));
  const text = String(formData.get("next_action") ?? "").trim();
  const date = String(formData.get("next_action_date") ?? "").trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };
  if (text && !date) return { error: "Pick the date for the next action." };
  const db = await createClient();
  const { error } = await db
    .from("leads")
    .update({ next_action: text || null, next_action_date: date || null })
    .eq("id", id);
  if (error) return { error: friendly(error) };
  refresh(id);
  return { ok: true };
}

// kind "note" = internal note; "contact" = you contacted the lead (call, email, message).
export async function addLeadEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(LEAD_WORKERS);
  const id = String(formData.get("id"));
  const kind = formData.get("kind") === "contact" ? "contact" : "note";
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: kind === "contact" ? "Say how you contacted them." : "Write the note first." };
  const db = await createClient();
  const { error } = await db.from("lead_events").insert({ lead_id: id, kind, body });
  if (error) return { error: friendly(error) };
  await db.from("leads").update({ last_touch_at: new Date().toISOString() }).eq("id", id);
  refresh(id);
  return { ok: true };
}

export async function markSubmissionReviewed(id: string): Promise<ActionState> {
  const user = await requireRole(LEAD_WORKERS);
  const db = await createClient();
  const { error } = await db
    .from("lead_form_submissions")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}
