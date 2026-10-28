import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The client's IMEI list of one shipped order as xlsx (from the portal_imeis view: own account only).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/portal/orders/[id]/imeis">) {
  const { id } = await ctx.params;
  const db = await createClient();
  const [{ data: order }, { data: rows }] = await Promise.all([
    db.from("portal_orders").select("number").eq("id", id).maybeSingle(),
    db.from("portal_imeis").select("imei, model, storage_gb, color, shipped_at").eq("order_id", id).order("imei"),
  ]);
  const { data: acc } = await db.from("portal_account").select("code").maybeSingle();
  if (!order || !acc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("IMEI");
  ws.columns = [{ header: "IMEI", width: 20 }, { header: "Model", width: 22 }, { header: "Storage", width: 10 }, { header: "Color", width: 16 }, { header: "Shipped", width: 12 }];
  ws.getRow(1).font = { bold: true };
  for (const r of rows ?? []) {
    const row = ws.addRow([r.imei, r.model ?? "", r.storage_gb ? `${r.storage_gb}GB` : "", r.color ?? "", r.shipped_at ?? ""]);
    row.getCell(1).numFmt = "@";
  }
  const body = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(body), {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${acc.code}_${order.number}_IMEI.xlsx"` },
  });
}
