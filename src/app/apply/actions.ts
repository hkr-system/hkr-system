"use server";

import { headers } from "next/headers";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";
import { BUSINESS_TYPES, HEARD_ABOUT, VOLUME_RANGES, type LeadStage } from "@/lib/leads/constants";
import { buildLeadFields, scoreFields } from "@/lib/leads/record";
import { loadOwnerByMarket, loadScoringConfig } from "@/lib/leads/service";
import { syncLeadToBrevo } from "@/lib/leads/brevo-sync";
import { T, type Lang } from "./texts";

export type ApplyState = { done?: boolean; error?: string };

const MAX_PER_HOUR = 5;

// Public form handler (no login). Uses the secret key because visitors have no
// database access; every rule is enforced here.
export async function submitApplication(_prev: ApplyState, fd: FormData): Promise<ApplyState> {
  const lang: Lang = fd.get("lang") === "es" ? "es" : "en";
  const t = T[lang];
  if (!adminClientAvailable()) return { error: t.unavailable };

  // Honeypot: real people never see or fill this field.
  if (String(fd.get("fax") ?? "").trim()) return { done: true };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const userAgent = (h.get("user-agent") ?? "").slice(0, 300);

  const raw = {
    company: fd.get("company"), country: fd.get("country"), city: fd.get("city"), contact_name: fd.get("contact_name"),
    email: fd.get("email"), phone: fd.get("whatsapp"), website: fd.get("website"), business_type: fd.get("business_type"),
    sells_iphones: fd.get("sells_iphones"), sells_refurbished: fd.get("sells_refurbished"), volume_range: fd.get("volume_range"),
    heard_about: fd.get("heard_about"), language: lang, whatsapp_opt_in: fd.get("whatsapp_opt_in") === "on",
  };
  const rawJson = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" || typeof v === "boolean" ? v : null]));

  const requiredOk =
    String(raw.company ?? "").trim() && String(raw.country ?? "").trim() && String(raw.contact_name ?? "").trim() &&
    String(raw.email ?? "").trim() && BUSINESS_TYPES.some((b) => b.value === raw.business_type) &&
    VOLUME_RANGES.some((v) => v.value === raw.volume_range) &&
    ["yes", "no"].includes(String(raw.sells_iphones)) && ["yes", "no"].includes(String(raw.sells_refurbished));
  if (!requiredOk) return { error: t.required };
  if (raw.heard_about && !HEARD_ABOUT.some((o) => o.value === raw.heard_about)) raw.heard_about = "other";

  const { fields, problems } = buildLeadFields(raw);
  if (problems.length) return { error: problems.join(" ") };

  const db = createAdminClient();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("lead_form_submissions").select("id", { count: "exact", head: true })
    .eq("ip", ip).gte("submitted_at", hourAgo);
  if ((count ?? 0) >= MAX_PER_HOUR) return { error: t.tooMany };

  const config = await loadScoringConfig(db);
  const { columns, result } = scoreFields(fields, config);
  const ownerByMarket = await loadOwnerByMarket(db);
  const autoOwner = (fields.market && ownerByMarket[fields.market]) || null;
  // Tier A goes straight to Qualified; B, C and disqualified start in New (decided Oct 2026).
  const formStage: LeadStage = result.tier === "A" && !result.disqualified ? "Qualified" : "New";

  // Merge with an existing lead by email or phone.
  let { data: existing } = await db.from("leads").select("id, stage, owner_user_id").eq("email", fields.email!).maybeSingle();
  if (!existing && fields.phone_e164) {
    ({ data: existing } = await db.from("leads").select("id, stage, owner_user_id").eq("phone_e164", fields.phone_e164).maybeSingle());
  }

  let leadId: string;
  const present = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== ""));
  if (existing) {
    leadId = existing.id;
    const { error } = await db.from("leads").update({
      ...present, ...columns,
      whatsapp_opt_in: raw.whatsapp_opt_in || undefined,
      ...(existing.stage === "New" && formStage === "Qualified" ? { stage: formStage } : {}),
      ...(existing.owner_user_id ? {} : { owner_user_id: autoOwner }),
    }).eq("id", existing.id);
    if (error) return { error: t.unavailable };
  } else {
    const { data, error } = await db.from("leads").insert({
      ...fields, ...columns, company: fields.company, source: "website_form", stage: formStage,
      owner_user_id: autoOwner, whatsapp_opt_in: raw.whatsapp_opt_in,
    }).select("id").single();
    if (error || !data) return { error: t.unavailable };
    leadId = data.id;
  }

  await db.from("lead_events").insert({
    lead_id: leadId,
    kind: "form",
    body:
      `Form submitted${existing ? " (existing lead updated)" : ""}. Score ${result.score}, tier ${result.tier}` +
      (result.disqualified ? `, DISQUALIFIED (${result.disqualifyReason})` : "") +
      (result.matched.length ? `. Rules: ${result.matched.join(", ")}` : ""),
    data: rawJson,
    user_id: null,
  });
  await db.from("lead_form_submissions").insert({
    raw: rawJson, computed_score: result.score, tier: result.tier, disqualified: result.disqualified,
    lead_id: leadId, merged: Boolean(existing), ip, user_agent: userAgent,
  });

  await syncLeadToBrevo(leadId);
  return { done: true };
}
