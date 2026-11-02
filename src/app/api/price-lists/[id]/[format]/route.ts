import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { loadListDoc, loadLogo } from "@/lib/price-lists/service";
import { listFileBase, toPlainText, toWhatsApp, toXlsx } from "@/lib/price-lists/outputs";
import { toPdf } from "@/lib/price-lists/outputs-pdf";

// "Get price list" (brief Phase 6 item 6): xlsx (iPhonePrices format), pdf, txt, wa (WhatsApp text).
// Read with the user's session: RLS decides (base list = admin only; bd = approved lists of own accounts).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/price-lists/[id]/[format]">) {
  const { id, format } = await ctx.params;
  const user = await getCurrentUser();
  if (!user.role) return NextResponse.json({ error: "no access" }, { status: 403 });
  const db = await createClient();
  const doc = await loadListDoc(db, id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const name = `${listFileBase(doc.code, doc.list.valid_from)}${doc.list.status === "draft" ? "_DRAFT" : ""}`;
  if (format === "xlsx") {
    const x = await toXlsx(doc.rows, doc.meta);
    return new NextResponse(new Uint8Array(x), {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}.xlsx"` },
    });
  }
  if (format === "pdf") {
    const pdf = await toPdf(doc.rows, doc.meta, await loadLogo());
    return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}.pdf"` } });
  }
  if (format === "txt" || format === "wa") {
    const text = format === "wa" ? toWhatsApp(doc.rows, doc.meta) : toPlainText(doc.rows, doc.meta);
    return new NextResponse(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return NextResponse.json({ error: "unknown format" }, { status: 400 });
}
