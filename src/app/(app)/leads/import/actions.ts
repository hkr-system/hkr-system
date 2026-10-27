"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { commitImport, MAX_IMPORT_ROWS, planImport, type ImportRow, type PlannedRow } from "@/lib/leads/import";
import { loadScoringConfig } from "@/lib/leads/service";

type Counts = { new: number; merge: number; duplicate: number; invalid: number };

export type PreviewResult = { error?: string; counts?: Counts; rows?: PlannedRow[] };
export type CommitResult = { error?: string; created?: number; merged?: number; skipped?: number; failures?: string[] };

function check(rows: ImportRow[], source: string) {
  if (!source.trim()) return "Give the import a source name (e.g. Leads NL).";
  if (!rows.length) return "The file has no rows.";
  if (rows.length > MAX_IMPORT_ROWS) return `At most ${MAX_IMPORT_ROWS} rows per import. Split the file.`;
  return null;
}

export async function previewImport(rows: ImportRow[], source: string): Promise<PreviewResult> {
  await requireRole(["admin", "bd"]);
  const problem = check(rows, source);
  if (problem) return { error: problem };
  const db = await createClient();
  const { plan } = await planImport(db, rows);
  const counts: Counts = { new: 0, merge: 0, duplicate: 0, invalid: 0 };
  plan.forEach((p) => counts[p.status]++);
  // Problems first, then the rest; the screen shows the first 200.
  const order = { invalid: 0, duplicate: 1, merge: 2, new: 3 } as const;
  return { counts, rows: [...plan].sort((a, b) => order[a.status] - order[b.status] || a.row - b.row).slice(0, 200) };
}

export async function runImport(rows: ImportRow[], source: string, fileName: string): Promise<CommitResult> {
  await requireRole(["admin", "bd"]);
  const problem = check(rows, source);
  if (problem) return { error: problem };
  const db = await createClient();
  try {
    const config = await loadScoringConfig(db);
    const res = await commitImport(db, rows, source.trim(), fileName, config);
    revalidatePath("/leads", "layout");
    return res;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function undoImport(batchId: string): Promise<{ error?: string; removed?: number; kept?: number }> {
  await requireRole(["admin", "bd"]);
  const db = await createClient();
  const { data, error } = await db.rpc("undo_lead_import", { p_batch_id: batchId });
  if (error) return { error: error.message };
  // No revalidatePath here: the button shows the result in place (a refresh would hide it).
  const r = Array.isArray(data) ? data[0] : data;
  return { removed: r?.removed ?? 0, kept: r?.kept ?? 0 };
}
