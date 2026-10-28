import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/files";

// A client opens one of their documents: the row comes from the portal_files view (own account,
// client-visible kinds only) and the storage policy checks the same before signing the link.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/portal/files/[id]">) {
  const { id } = await ctx.params;
  const db = await createClient();
  const { data: f } = await db.from("portal_files").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!f?.storage_path) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data, error } = await db.storage.from(FILES_BUCKET).createSignedUrl(f.storage_path, 120, { download: f.file_name ?? undefined });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "no link" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
