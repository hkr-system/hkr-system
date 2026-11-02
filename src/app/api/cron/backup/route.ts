import { NextResponse, type NextRequest } from "next/server";
import { adminClientAvailable } from "@/lib/supabase/admin";
import { runBackup } from "@/lib/backup/run";

export const maxDuration = 60;

// Weekly job (vercel.json, Sunday 04:00 UTC). Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminClientAvailable()) return NextResponse.json({ skipped: "SUPABASE_SECRET_KEY not set" });
  try {
    const summary = await runBackup();
    return NextResponse.json(summary, { status: summary.problems.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
