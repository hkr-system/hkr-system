import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPortalContext, portalDate, portalMoney } from "@/lib/portal/session";
import { PORTAL_ORDER_NEXT, PORTAL_ORDER_STATUS } from "@/lib/portal/texts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: { absolute: "Order · Client portal" } };

const KIND = { "INV-HK": ["Invoice (HK)", "Factura (HK)"], "INV-EU": ["Invoice (EU partner)", "Factura (socio UE)"], IMEI: ["IMEI list", "Lista de IMEIs"],
  "TRK-HK": ["Tracking", "Rastreo"], "TRK-EU": ["Tracking (EU)", "Rastreo (UE)"], POD: ["Proof of delivery", "Prueba de entrega"], CN: ["Credit note", "Nota de crédito"] } as Record<string, [string, string]>;

export default async function PortalOrder({ params }: PageProps<"/portal/orders/[id]">) {
  const { id } = await params;
  const { db, t, lang } = await getPortalContext();
  const { data: o } = await db.from("portal_orders").select("*").eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: lines }, { data: imeis }, { data: files }] = await Promise.all([
    db.from("portal_order_lines").select("item, qty, unit_price_usd, battery_new, sort_order").eq("order_id", id).order("sort_order"),
    db.from("portal_imeis").select("imei, model, storage_gb, color").eq("order_id", id).order("imei"),
    db.from("portal_files").select("id, kind, file_name, created_at").eq("owner_table", "orders").eq("owner_id", id).order("created_at"),
  ]);
  const cur = o.pays_in_eur ? "EUR" : "USD";
  const next = PORTAL_ORDER_NEXT[lang][o.status];

  return (
    <div className="grid gap-4">
      <div>
        <Link href="/portal/orders" className="text-sm text-muted-foreground hover:underline">← {t.allOrders}</Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight"><span className="font-mono">{o.number}</span> · {PORTAL_ORDER_STATUS[lang][o.status]}</h1>
        {next ? <p className="mt-1 text-sm">{o.payment_awaiting ? t.paymentProcessing : next}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader><CardTitle>{t.products}</CardTitle></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">{t.products}</TableHead><TableHead className="text-right">{t.qty}</TableHead><TableHead className="text-right">{t.unitPrice}</TableHead><TableHead className="pr-4 text-right">{t.amount}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(lines ?? []).map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-4">{l.item}{l.battery_new ? <span className="block text-xs text-muted-foreground">New Battery cell 0 Cycle</span> : null}</TableCell>
                      <TableCell className="text-right" data-tabular>{l.qty}</TableCell>
                      <TableCell className="text-right" data-tabular>{portalMoney(l.unit_price_usd)}</TableCell>
                      <TableCell className="pr-4 text-right" data-tabular>{portalMoney(Number(l.qty) * Number(l.unit_price_usd))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="ml-auto grid max-w-sm gap-1 px-4 pt-3 text-sm" data-tabular>
                {Number(o.battery_line_usd) ? <Row k="New battery cell" v={portalMoney(o.battery_line_usd)} /> : null}
                {Number(o.freight_usd) ? <Row k="Freight" v={portalMoney(o.freight_usd)} /> : null}
                {Number(o.customs_usd) ? <Row k="Customs" v={portalMoney(o.customs_usd)} /> : null}
                {Number(o.rma_discount_usd) ? <Row k="RMA" v={`−${portalMoney(o.rma_discount_usd)}`} /> : null}
                {Number(o.usdt_fee_usd) ? <Row k="USDT fee" v={portalMoney(o.usdt_fee_usd)} /> : null}
                <div className="flex justify-between border-t pt-1 font-semibold"><span>{t.invoiceTotal}</span><span>{portalMoney(o.total_usd)}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="portal-imeis">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>{t.imeis} ({imeis?.length ?? 0})</CardTitle>
              {imeis?.length ? <Button asChild size="sm" variant="outline"><a href={`/api/portal/orders/${id}/imeis`}>{t.downloadImeis}</a></Button> : null}
            </CardHeader>
            <CardContent>
              {imeis?.length ? (
                <div className="grid max-h-80 gap-x-6 gap-y-0.5 overflow-y-auto font-mono text-xs sm:grid-cols-2 lg:grid-cols-3">
                  {imeis.map((i) => <span key={i.imei} title={[i.model, i.storage_gb ? `${i.storage_gb}GB` : "", i.color].filter(Boolean).join(" ")}>{i.imei}</span>)}
                </div>
              ) : <p className="text-sm text-muted-foreground">—</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader><CardTitle>{t.toPay}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm" data-tabular>
              <Row k={t.toPay} v={portalMoney(o.payable_total, cur)} />
              <Row k={t.deposit} v={portalMoney(o.deposit_payable, cur)} />
              <Row k={t.paid} v={portalMoney(Number(o.deposit_confirmed) + Number(o.balance_confirmed), cur)} />
              <div className={`flex justify-between font-semibold ${Number(o.balance_pending) > 0 ? "text-hkr-action" : ""}`}><span>{t.balancePending}</span><span>{portalMoney(o.balance_pending, cur)}</span></div>
              {o.payment_awaiting ? <p className="text-xs text-muted-foreground">{t.paymentProcessing}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.shipped}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <Row k={t.date} v={portalDate(o.order_date, lang)} />
              <Row k={t.eta} v={portalDate(o.eta_date, lang)} />
              <Row k={t.shipped} v={portalDate(o.ship_date, lang)} />
              <Row k={t.tracking} v={o.tracking ? `${o.courier ?? ""} ${o.tracking}` : "—"} />
              <Row k={t.delivered} v={portalDate(o.delivered_date, lang)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.documents}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm" data-testid="portal-docs">
              {(files ?? []).map((f) => (
                <a key={f.id} href={`/api/portal/files/${f.id}`} target="_blank" rel="noreferrer" className="flex justify-between gap-2 hover:underline">
                  <span className="truncate">{f.file_name}</span><span className="shrink-0 text-xs text-muted-foreground">{KIND[f.kind ?? ""]?.[lang === "es" ? 1 : 0] ?? f.kind}</span>
                </a>
              ))}
              {!files?.length ? <p className="text-muted-foreground">{t.noDocuments}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}
