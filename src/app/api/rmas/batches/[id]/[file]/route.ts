import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { FILES_BUCKET } from "@/lib/files";
import { batchFileName, batchXlsx } from "@/lib/documents/rma-batch";
import { loadBatchDoc } from "@/lib/rmas/batch";

// Consolidated Excel (all clients, or ?client=CODE for one client's copy) and the label of a batch.
// RLS on rma_batches / storage lets only admin and account specialists through.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/rmas/batches/[id]/[file]">) {
  const { id, file } = await ctx.params;
  const user = await getCurrentUser();
  if (!user.role) return NextResponse.json({ error: "no access" }, { status: 403 });
  const db = await createClient();
  const doc = await loadBatchDoc(db, id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (file === "xlsx") {
    const client = req.nextUrl.searchParams.get("client") ?? undefined;
    const body = await batchXlsx(doc, client);
    return new NextResponse(new Uint8Array(body), {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${batchFileName(doc, client)}"` },
    });
  }
  if (file === "label" && doc.labelPath) {
    const { data, error } = await db.storage.from(FILES_BUCKET).createSignedUrl(doc.labelPath, 120, { download: doc.label ?? "label" });
    if (error || !data) return NextResponse.json({ error: error?.message ?? "no link" }, { status: 500 });
    return NextResponse.redirect(data.signedUrl);
  }
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
