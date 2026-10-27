import type { Json } from "@/types/database";
import type { LeadTier } from "./constants";

export type ScoringRule = {
  label: string;
  field: string;
  operator: string; // eq | gte | between | in | in_setting
  value: Json | null;
  points: number;
  disqualify: boolean;
  active: boolean;
};

export type ScoringConfig = {
  rules: ScoringRule[];
  thresholds: { A: number; B: number };
  settings: Record<string, Json>; // for operator in_setting (e.g. lead_target_countries)
};

export type ScoreResult = {
  score: number;
  tier: LeadTier;
  disqualified: boolean;
  disqualifyReason: string | null;
  matched: string[]; // labels of the rules that applied, for the timeline
};

type LeadLike = Record<string, unknown>;

function matches(rule: ScoringRule, lead: LeadLike, settings: Record<string, Json>): boolean {
  const v = lead[rule.field];
  if (v === null || v === undefined || v === "") return false;
  switch (rule.operator) {
    case "eq":
      return v === rule.value;
    case "gte":
      return typeof v === "number" && typeof rule.value === "number" && v >= rule.value;
    case "between":
      return (
        typeof v === "number" && Array.isArray(rule.value) &&
        typeof rule.value[0] === "number" && typeof rule.value[1] === "number" &&
        v >= rule.value[0] && v <= rule.value[1]
      );
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(v as Json);
    case "in_setting": {
      const list = typeof rule.value === "string" ? settings[rule.value] : null;
      return Array.isArray(list) && list.includes(v as Json);
    }
    default:
      return false;
  }
}

// Score = sum of points of active matching rules. Any matching "disqualify" rule
// marks the lead disqualified (brief §3 row 8). Tier: A ≥ thresholds.A, B ≥ thresholds.B, else C.
export function scoreLead(lead: LeadLike, config: ScoringConfig): ScoreResult {
  let score = 0;
  const matched: string[] = [];
  let disqualifyReason: string | null = null;
  for (const rule of config.rules) {
    if (!rule.active || !matches(rule, lead, config.settings)) continue;
    matched.push(rule.label);
    if (rule.disqualify) disqualifyReason ??= rule.label;
    else score += rule.points;
  }
  const tier: LeadTier = score >= config.thresholds.A ? "A" : score >= config.thresholds.B ? "B" : "C";
  return { score, tier, disqualified: disqualifyReason !== null, disqualifyReason, matched };
}
