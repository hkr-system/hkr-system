import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type BackupSummary = { at: string; path: string; tables: number; rows: number; problems: string[] };

// Every table → backups/YYYY-MM-DD/<table>.json in the private bucket "backups" (free-plan backup, Oct 30 2026).
// Used by the weekly cron (/api/cron/backup) and the admin's "Run backup now" button on the go-live page.
export async function runBackup(): Promise<BackupSummary> {
  const db = createAdminClient();
  const { data: names, error } = await db.rpc("backup_table_names");
  if (error) throw new Error(error.message);
  const day = new Date().toISOString().slice(0, 10);
  let rows = 0;
  const problems: string[] = [];
  for (const table of (names ?? []) as unknown as string[]) {
    const all: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: e } = await db.from(table as never).select("*").range(from, from + 999);
      if (e) { problems.push(`${table}: ${e.message}`); break; }
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    rows += all.length;
    const { error: up } = await db.storage.from("backups")
      .upload(`${day}/${table}.json`, JSON.stringify(all), { contentType: "application/json", upsert: true });
    if (up) problems.push(`${table}: ${up.message}`);
  }
  const summary = { at: new Date().toISOString(), path: `backups/${day}/`, tables: (names ?? []).length, rows, problems };
  await db.from("settings").update({ value: summary as never }).eq("key", "last_backup");
  return summary;
}
