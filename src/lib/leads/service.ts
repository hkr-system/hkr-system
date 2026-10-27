import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { ScoringConfig } from "./scoring";

type DB = SupabaseClient<Database>;

// Reads the scoring rules and the settings they depend on.
export async function loadScoringConfig(db: DB): Promise<ScoringConfig> {
  const [{ data: rules }, { data: settings }] = await Promise.all([
    db.from("scoring_rules").select("label, field, operator, value, points, disqualify, active").order("sort_order"),
    db.from("settings").select("key, value").in("key", ["lead_tier_thresholds", "lead_target_countries"]),
  ]);
  const map: Record<string, Json> = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
  const t = (map.lead_tier_thresholds ?? {}) as { A?: number; B?: number };
  return {
    rules: rules ?? [],
    thresholds: { A: Number(t.A ?? 70), B: Number(t.B ?? 40) },
    settings: map,
  };
}

export async function loadOwnerByMarket(db: DB): Promise<Record<string, string | null>> {
  const { data } = await db.from("settings").select("value").eq("key", "lead_owner_by_market").maybeSingle();
  return (data?.value ?? {}) as Record<string, string | null>;
}

export async function loadTeam(db: DB) {
  const { data } = await db
    .from("profiles")
    .select("user_id, full_name, email, role, active")
    .order("full_name");
  return (data ?? []).filter((p) => p.active && p.role);
}
