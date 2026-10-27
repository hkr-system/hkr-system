"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type SettingState = { ok?: boolean; error?: string };

// Saves one parameter. The value must keep the same kind as before
// (number stays number, list stays list…). RLS also blocks non-admins.
export async function updateSetting(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const key = String(formData.get("key") ?? "");
  const raw = String(formData.get("value") ?? "").trim();

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("settings").select("value").eq("key", key).maybeSingle();
  if (readError || !current) return { error: "Setting not found." };

  let next: NonNullable<Json>;
  const before = current.value;
  if (typeof before === "number") {
    const n = Number(raw.replace(",", "."));
    if (raw === "" || !Number.isFinite(n)) return { error: "Enter a number." };
    next = n;
  } else if (typeof before === "string") {
    if (!raw) return { error: "Value cannot be empty." };
    next = raw;
  } else {
    let parsed: Json;
    try {
      parsed = JSON.parse(raw) as Json;
    } catch {
      return { error: "Not valid JSON. Keep the same shape as before." };
    }
    const sameKind =
      parsed !== null && typeof parsed === "object" && Array.isArray(before) === Array.isArray(parsed);
    if (!sameKind || parsed === null) return { error: "Keep the same shape as before (list or object)." };
    next = parsed;
  }

  const { error } = await supabase.from("settings").update({ value: next }).eq("key", key);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// --- Lead scoring rules (Phase 1) -------------------------------------------

export async function updateScoringRule(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const id = String(formData.get("id"));
  const points = Number(formData.get("points"));
  const active = formData.get("active") === "on";
  const rawValue = String(formData.get("value") ?? "").trim();
  if (!Number.isInteger(points) || points < 0 || points > 100) return { error: "Points must be a whole number 0–100." };
  const supabase = await createClient();
  const { data: rule } = await supabase.from("scoring_rules").select("operator, value").eq("id", id).maybeSingle();
  if (!rule) return { error: "Rule not found." };
  let value: Json = rule.value;
  if (rule.operator !== "in_setting" && rawValue) {
    try {
      value = JSON.parse(rawValue) as Json;
    } catch {
      return { error: "Value is not valid JSON." };
    }
    const ok =
      (rule.operator === "eq" && (typeof value === "boolean" || typeof value === "string" || typeof value === "number")) ||
      (rule.operator === "gte" && typeof value === "number") ||
      (rule.operator === "between" && Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number")) ||
      (rule.operator === "in" && Array.isArray(value));
    if (!ok) return { error: "Keep the same shape as before." };
  }
  const { error } = await supabase.from("scoring_rules").update({ points, active, value }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateTargetCountries(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const { normalizeCountry } = await import("@/lib/leads/countries");
  const parts = String(formData.get("countries") ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const codes: string[] = [];
  for (const p of parts) {
    const c = normalizeCountry(p);
    if (!c) return { error: `Unknown country "${p}". Use names or 2-letter codes (NL, DE, MX…).` };
    if (!codes.includes(c)) codes.push(c);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update({ value: codes }).eq("key", "lead_target_countries");
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateOwnerByMarket(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const value: Record<string, string | null> = {};
  for (const m of ["EU", "LATAM", "US", "ROW"]) {
    const v = String(formData.get(m) ?? "");
    value[m] = /^[0-9a-f-]{36}$/.test(v) ? v : null;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update({ value }).eq("key", "lead_owner_by_market");
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
