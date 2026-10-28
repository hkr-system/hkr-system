import type { Metadata } from "next";
import Link from "next/link";
import { getPortalContext, portalDate, portalMoney } from "@/lib/portal/session";
import { PORTAL_ORDER_STATUS } from "@/lib/portal/texts";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: { absolute: "Orders · Client portal" } };

export default async function PortalOrders() {
  const { db, t, lang } = await getPortalContext();
  const { data: orders } = await db.from("portal_orders")
    .select("id, number, status, order_date, pieces, payable_total, pays_in_eur, balance_pending, hk_invoice_no, partner_invoice_no, tracking, courier, imei_count")
    .order("order_date", { ascending: false });
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t.orders}</h1>
      <Card>
        <CardContent className="px-0">
          <Table data-testid="portal-orders">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t.order}</TableHead><TableHead>{t.date}</TableHead><TableHead>{t.status}</TableHead>
                <TableHead className="text-right">{t.units}</TableHead><TableHead className="text-right">{t.toPay}</TableHead>
                <TableHead className="text-right">{t.balancePending}</TableHead><TableHead>{t.invoiceHK}</TableHead><TableHead>{t.tracking}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orders ?? []).map((o) => {
                const cur = o.pays_in_eur ? "EUR" : "USD";
                return (
                  <TableRow key={o.id}>
                    <TableCell className="pl-4"><Link href={`/portal/orders/${o.id}`} className="font-mono text-xs font-medium underline">{o.number}</Link></TableCell>
                    <TableCell className="text-xs">{portalDate(o.order_date, lang)}</TableCell>
                    <TableCell className="text-xs">{PORTAL_ORDER_STATUS[lang][o.status]}</TableCell>
                    <TableCell className="text-right" data-tabular>{o.pieces}</TableCell>
                    <TableCell className="text-right" data-tabular>{portalMoney(o.payable_total, cur)}</TableCell>
                    <TableCell className={`text-right ${Number(o.balance_pending) > 0 ? "font-medium text-hkr-action" : ""}`} data-tabular>{portalMoney(o.balance_pending, cur)}</TableCell>
                    <TableCell className="text-xs">{[o.hk_invoice_no, o.partner_invoice_no].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="text-xs">{o.tracking ? `${o.courier ?? ""} ${o.tracking}` : "—"}</TableCell>
                  </TableRow>
                );
              })}
              {!orders?.length ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">—</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
