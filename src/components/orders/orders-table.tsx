import Link from "next/link";
import { formatDate } from "@/lib/format";
import { money, type OrderStatus } from "@/lib/orders/constants";
import { OrderStatusBadge } from "@/components/accounts/badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type OrderRow = {
  id: string; number: string; status: OrderStatus; order_date: string; pieces: number; total_usd: number;
  eta_date: string | null; account_id: string; account_code: string; account_name: string;
  pays_in_eur: boolean; payable_total: number; deposit_payable: number; deposit_confirmed: number;
  balance_confirmed: number; payment_awaiting: boolean; balance_ok: boolean; imei_count: number; label_ok: boolean;
};

function paymentState(o: OrderRow) {
  const cur = o.pays_in_eur ? "EUR" : "USD";
  if (o.payment_awaiting) return <span className="text-amber-700">Proof awaiting confirmation</span>;
  if (o.status === "quoted") return <span className="text-muted-foreground">—</span>;
  if (o.deposit_confirmed <= 0) return <span className="text-destructive">Deposit due {money(o.deposit_payable, cur)}</span>;
  if (!o.balance_ok) {
    const bal = Number(o.payable_total) - Number(o.deposit_payable) - Number(o.balance_confirmed);
    return <span className={o.status === "ready_to_ship" ? "text-destructive" : "text-muted-foreground"}>Balance due {money(bal, cur)}</span>;
  }
  return <span className="text-emerald-700">Paid</span>;
}

export function OrdersTable({ orders, showAccount = true, today }: { orders: OrderRow[]; showAccount?: boolean; today: string }) {
  return (
    <Table data-testid="orders-table">
      <TableHeader>
        <TableRow>
          {showAccount ? <TableHead className="pl-4">Account</TableHead> : null}
          <TableHead className={showAccount ? "" : "pl-4"}>Order</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Pcs</TableHead>
          <TableHead className="text-right">Invoice</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead>ETA</TableHead>
          <TableHead>Ship check</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => {
          const shipStage = ["ready_to_ship", "balance_paid"].includes(o.status);
          return (
            <TableRow key={o.id}>
              {showAccount ? (
                <TableCell className="pl-4">
                  <Link href={`/accounts/${o.account_id}`} className="font-mono text-xs hover:underline">{o.account_code}</Link>
                  <span className="block truncate text-xs text-muted-foreground">{o.account_name}</span>
                </TableCell>
              ) : null}
              <TableCell className={showAccount ? "" : "pl-4"}><Link href={`/orders/${o.id}`} className="font-medium hover:underline">{o.number}</Link></TableCell>
              <TableCell><OrderStatusBadge status={o.status} /></TableCell>
              <TableCell className="text-xs">{formatDate(o.order_date)}</TableCell>
              <TableCell className="text-right" data-tabular>{o.pieces}</TableCell>
              <TableCell className="text-right" data-tabular>
                {money(o.total_usd)}
                {o.pays_in_eur ? <span className="block text-xs text-muted-foreground">{money(o.payable_total, "EUR")}</span> : null}
              </TableCell>
              <TableCell className="text-xs">{paymentState(o)}</TableCell>
              <TableCell className="text-xs">
                {o.eta_date ? <span className={o.eta_date < today && !["shipped", "delivered", "closed"].includes(o.status) ? "text-destructive" : ""}>{formatDate(o.eta_date)}</span>
                  : ["deposit_paid", "in_preparation"].includes(o.status) ? <span className="text-amber-700">ETA pending</span> : "—"}
              </TableCell>
              <TableCell className="text-xs">
                {shipStage ? (
                  <span className={o.balance_ok && o.imei_count > 0 && o.label_ok ? "font-medium text-emerald-700" : "text-muted-foreground"}>
                    {o.balance_ok && o.imei_count > 0 && o.label_ok ? "Clear to ship" : `${[o.balance_ok ? "" : "balance", o.imei_count ? "" : "IMEI", o.label_ok ? "" : "label"].filter(Boolean).join(", ")} missing`}
                  </span>
                ) : "—"}
              </TableCell>
            </TableRow>
          );
        })}
        {!orders.length ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No orders.</TableCell></TableRow> : null}
      </TableBody>
    </Table>
  );
}
