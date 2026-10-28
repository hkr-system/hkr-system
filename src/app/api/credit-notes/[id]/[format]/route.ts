import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { creditNoteXlsx, loadCreditNoteDoc } from "@/lib/documents/credit-note";
import { creditNotePdf } from "@/lib/documents/credit-note-pdf";

// Credit note as PDF or xlsx, generated on the fly (drafts say DRAFT). The row is read with the
// user's session, so RLS decides who may download it.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/credit-notes/[id]/[format]">) {
  const { id, format } = await ctx.params;
  const user = await getCurrentUser();
  if (!user.role) return NextResponse.json({ error: "no access" }, { status: 403 });
  const db = await createClient();
  const doc = await loadCreditNoteDoc(db, id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const name = `${doc.number}${doc.status === "draft" ? "_DRAFT" : ""}`;
  if (format === "pdf") {
    const pdf = await creditNotePdf(doc);
    return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}.pdf"` } });
  }
  if (format === "xlsx") {
    const x = await creditNoteXlsx(doc);
    return new NextResponse(new Uint8Array(x), {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}.xlsx"` },
    });
  }
  return NextResponse.json({ error: "unknown format" }, { status: 400 });
}
