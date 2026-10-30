import { NextResponse, type NextRequest } from "next/server";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Weekly job (vercel.json, Sunday 04:00 UTC): every table → backups/YYYY-MM-DD/<table>.json in the
// private bucket "backups". Our own backup while the Supabase free plan has no daily backups.
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminClientAvailable()) return NextResponse.json({ skipped: "SUPABASE_SECRET_KEY not set" });

  const db = createAdminClient();
  const { data: names, error } = await db.rpc("backup_table_names");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  return NextResponse.json(summary, { status: problems.length ? 207 : 200 });
}
