import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/files";

// Opens an account file with a 2-minute signed link. Both the file row and the storage
// object are read with the user's own session, so RLS decides who may open it.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const db = await createClient();
  const { data: file } = await db.from("files").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data, error } = await db.storage.from(FILES_BUCKET).createSignedUrl(file.storage_path, 120, { download: file.file_name });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "no link" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
