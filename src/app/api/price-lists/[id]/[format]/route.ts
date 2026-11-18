import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { loadListDoc, loadLogo } from "@/lib/price-lists/service";
import { listFileBase, toPlainText, toWhatsApp, toXlsx } from "@/lib/price-lists/outputs";
import { toPdf } from "@/lib/price-lists/outputs-pdf";
import { d2dOutput } from "@/lib/price-lists/d2d-service";

// "Get price list" (brief Phase 6 item 6): xlsx (iPhonePrices format), pdf, txt, wa (WhatsApp text).
// Read with the user's session: RLS decides (base list = admin only; bd = approved lists of own accounts).
// ?mode=d2d&via=<company>&rate=1.12 → the same list in EUR, door to door (EU clients, Nov 18 2026)
export async function GET(req: NextRequest, ctx: RouteContext<"/api/price-lists/[id]/[format]">) {
  const { id, format } = await ctx.params;
  const user = await getCurrentUser();
  if (!user.role) return NextResponse.json({ error: "no access" }, { status: 403 });
  const db = await createClient();
  const doc = await loadListDoc(db, id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const q = req.nextUrl.searchParams;
  if (q.get("mode") === "d2d") {
    if (!doc.list.account_id) return NextResponse.json({ error: "the base list has no door-to-door version" }, { status: 400 });
    const via = q.get("via") ?? "";
    if (!/^[0-9a-f-]{36}$/.test(via)) return NextResponse.json({ error: "choose the company" }, { status: 400 });
    const out = await d2dOutput(db, via, Number(q.get("rate")), doc.rows, doc.meta);
    if ("error" in out) return new NextResponse(out.error, { status: 400 });
    doc.rows = out.rows; doc.meta = out.meta;
  }
  const d2d = q.get("mode") === "d2d";
  const name = `${listFileBase(doc.code, doc.list.valid_from, doc.list.brand)}${d2d ? "_D2D-EUR" : ""}${doc.list.status === "draft" ? "_DRAFT" : ""}`;
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
