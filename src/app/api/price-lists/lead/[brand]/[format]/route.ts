import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, userCan } from "@/lib/auth";
import { isBrand } from "@/lib/brands";
import { loadLogo } from "@/lib/price-lists/service";
import { toPlainText, toWhatsApp, toXlsx } from "@/lib/price-lists/outputs";
import { toPdf } from "@/lib/price-lists/outputs-pdf";
import { d2dOutput } from "@/lib/price-lists/d2d-service";
import { leadFileBase, loadLeadListDoc } from "@/lib/price-lists/lead-list";

// Lead price list (Nov 24 2026): xlsx, pdf, txt, wa — admin + bd. No client name, no RMA amortization.
// ?mode=d2d&via=<company>&rate=1.12 → the same list in EUR, door to door (the company's name is never on the file).
export async function GET(req: NextRequest, ctx: RouteContext<"/api/price-lists/lead/[brand]/[format]">) {
  const { brand, format } = await ctx.params;
  const user = await getCurrentUser();
  if (!(user.role === "admin" || (user.role === "bd" && userCan(user, "price-lists")))) return NextResponse.json({ error: "no access" }, { status: 403 });
  if (!isBrand(brand)) return NextResponse.json({ error: "unknown brand" }, { status: 400 });
  const db = await createClient();
  const doc = await loadLeadListDoc(db, brand);
  if ("error" in doc) return new NextResponse(doc.error, { status: 400 });
  const q = req.nextUrl.searchParams;
  const d2d = q.get("mode") === "d2d";
  if (d2d) {
    const via = q.get("via") ?? "";
    if (!/^[0-9a-f-]{36}$/.test(via)) return NextResponse.json({ error: "choose the company" }, { status: 400 });
    const out = await d2dOutput(db, via, Number(q.get("rate")), doc.rows, doc.meta);
    if ("error" in out) return new NextResponse(out.error, { status: 400 });
    doc.rows = out.rows; doc.meta = out.meta;
  }
  const name = `${leadFileBase(brand, doc.meta.validFrom)}${d2d ? "_D2D-EUR" : ""}`;
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
