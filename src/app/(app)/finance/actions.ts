"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok?: boolean; error?: string; message?: string };

const amount = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

// One row of the monthly plan: company goal, goal per owner, projection, history.
export async function saveMonthPlan(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const month = String(fd.get("month"));
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { error: "Unknown month." };

  const values = [...fd.entries()]
    .filter(([k]) => k.startsWith("goal_") || k === "projection" || k === "history")
    .map(([k, v]) => [k, amount(v)] as const);
  if (values.some(([, v]) => Number.isNaN(v))) return { error: "Use numbers only (e.g. 250000)." };

  for (const [k, v] of values) {
    if (k === "goal_company" || k.startsWith("goal_")) {
      const owner = k === "goal_company" ? null : k.slice(5);
      let del = db.from("sales_goals").delete().eq("month", month);
      del = owner ? del.eq("owner_user_id", owner) : del.is("owner_user_id", null);
      const { error } = await del;
      if (error) return { error: error.message };
      if (v !== null) {
        const { error: e2 } = await db.from("sales_goals").insert({ month, owner_user_id: owner, amount_usd: v });
        if (e2) return { error: e2.message };
      }
    }
  }
  const projection = amount(fd.get("projection"));
  if (projection === null) await db.from("sales_projections").delete().eq("month", month);
  else {
    const { error } = await db.from("sales_projections").upsert({ month, amount_usd: projection, suggested_usd: amount(fd.get("suggested")) });
    if (error) return { error: error.message };
  }
  if (fd.has("history")) {
    const history = amount(fd.get("history"));
    if (history === null) await db.from("sales_history").delete().eq("month", month);
    else {
      const { error } = await db.from("sales_history").upsert({ month, amount_usd: history });
      if (error) return { error: error.message };
    }
  }
  revalidatePath("/finance");
  revalidatePath("/sales");
  return { ok: true, message: "Saved." };
}

// Paste "2025-01  245000" (or "01/2025;245,000") one month per line.
export async function importHistory(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const rows: { month: string; amount_usd: number }[] = [];
  const bad: string[] = [];
  for (const raw of String(fd.get("text") ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d{4})[-/.](\d{1,2})\b|^(\d{1,2})[-/.](\d{4})\b/);
    const rest = line.replace(/^\S+/, "").replace(/[$\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(/[;,]/g, "");
    const n = Number(rest);
    if (!m || !Number.isFinite(n) || n < 0) { bad.push(line); continue; }
    const y = m[1] ?? m[4];
    const mo = String(m[2] ?? m[3]).padStart(2, "0");
    if (Number(mo) < 1 || Number(mo) > 12) { bad.push(line); continue; }
    rows.push({ month: `${y}-${mo}-01`, amount_usd: n });
  }
  if (!rows.length) return { error: bad.length ? `Could not read: ${bad.slice(0, 3).join(" | ")}` : "Paste at least one line." };
  const { error } = await db.from("sales_history").upsert(rows);
  if (error) return { error: error.message };
  revalidatePath("/finance");
  return { ok: true, message: `${rows.length} months saved.${bad.length ? ` ${bad.length} lines skipped: ${bad.slice(0, 3).join(" | ")}` : ""}` };
}
