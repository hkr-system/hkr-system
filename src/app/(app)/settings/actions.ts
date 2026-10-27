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
