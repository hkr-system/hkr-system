"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { runBackup } from "@/lib/backup/run";

export async function runBackupNow(): Promise<{ ok?: boolean; error?: string; message?: string }> {
  await requireRole(["admin"]);
  try {
    const s = await runBackup();
    revalidatePath("/settings/go-live");
    return s.problems.length ? { error: `Backup saved with problems: ${s.problems.join("; ")}` } : { ok: true, message: `Backup saved: ${s.tables} tables, ${s.rows} rows.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
