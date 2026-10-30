import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadTeam } from "@/lib/leads/service";
import { countryName } from "@/lib/leads/countries";
import { formatDate, formatDateTime } from "@/lib/format";
import { skuLabel } from "@/lib/orders/service";
import {
  DELIVERY_SETUP_LABEL, FILE_KINDS, ORDER_NEXT_ACTION, ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, money, type OrderStatus,
} from "@/lib/orders/constants";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";
import { OrderStatusBadge } from "@/components/accounts/badges";
import { NoteForm, PaymentsPanel, ShippingPanel, StatusControls } from "@/components/orders/order-panels";
import { FileUpload } from "@/components/orders/file-upload";
import { InvoicePanel, type InvoiceRow } from "@/components/orders/invoice-panel";
import { RealtimeRefresh } from "@/components/whatsapp/realtime-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const isAdmin = user.role === "admin";
  const { id } = await params;
  const db = await createClient();

  const { data: o } = await db.from("orders").select("*, accounts(id, code, name, country, invoice_format, billing_entity, intermediaries(name))").eq("id", id).maybeSingle();
  if (!o) notFound();
  const acc = o.accounts as unknown as { id: string; code: string; name: string; country: string | null; invoice_format: { battery_line_separate?: boolean } | null; intermediaries: { name: string } | null };

  const [{ data: ov }, { data: lines }, { data: payments }, { data: events }, { data: files }, team, finance, { data: invoice }, { data: issuers }] = await Promise.all([
    db.from("order_overview").select("*").eq("id", id).single(),
    db.from("order_lines").select("id, qty, unit_price_usd, battery_new, battery_unit_usd, description, skus(model, storage_gb, color, battery_eligible)").eq("order_id", id).order("sort_order"),
    db.from("payments").select("*").eq("order_id", id).order("created_at"),
    db.from("order_events").select("id, kind, from_status, to_status, body, file_id, user_id, created_at").eq("order_id", id).order("created_at", { ascending: false }).limit(100),
    db.from("files").select("id, kind, file_name, created_at").eq("owner_table", "orders").eq("owner_id", id).order("created_at", { ascending: false }),
    loadTeam(db),
    isAdmin ? db.from("orders_finance").select("base_cost_usd, margin_pct").eq("order_id", id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("invoices").select("id, number, status, version, invoice_date, consignee, ship_to, notify, shipment, lines, total_usd, file_pdf_id, file_xlsx_id").eq("order_id", id).neq("status", "void").maybeSingle(),
    db.from("settings").select("value").eq("key", "invoice_issuers").maybeSingle(),
  ]);
  const billingEntity = (o as unknown as { accounts: { billing_entity?: string } }).accounts.billing_entity ?? "ever_state";
  const issuerReady = Boolean(((issuers?.value ?? {}) as Record<string, { company?: string }>)[billingEntity]?.company);
  if (!ov) notFound();
  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));
  const status = o.status as OrderStatus;
  const cur = ov.pays_in_eur ? "EUR" : "USD";
  const dueDeposit = Math.max(0, Number(ov.deposit_payable) - Number(ov.deposit_confirmed));
  const dueBalance = Math.max(0, Number(ov.payable_total) - Number(ov.deposit_payable) - Number(ov.balance_confirmed));
  const clear = Boolean(ov.balance_ok && (ov.imei_count ?? 0) > 0 && ov.label_ok);
  const ship = (o.ship_to ?? {}) as Record<string, string>;
  const editable = !["shipped", "delivered", "closed"].includes(status);
  const step = ORDER_STATUSES.indexOf(status);

  return (
    <>
      <RealtimeRefresh tables={["orders", "payments", "order_events"]} />
      <div className="mb-4">
        <Link href={`/accounts/${acc.id}?tab=orders`} className="text-sm text-muted-foreground hover:underline">← {acc.code} · {acc.name}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="page-title"><span className="font-mono">{acc.code}</span> {o.number}</h1>
          <OrderStatusBadge status={status} />
          {["ready_to_ship", "balance_paid"].includes(status) ? (
            <span className={cn("text-xs font-medium", clear ? "text-emerald-700" : "text-amber-700")} data-testid="clear-to-ship">{clear ? "Clear to ship" : "Not clear to ship yet"}</span>
          ) : null}
          {editable ? <Button asChild size="sm" variant="outline" className="ml-auto"><Link href={`/orders/${id}/edit`}>Edit order</Link></Button> : null}
        </div>
      </div>

      {/* lifecycle bar */}
      <ol className="mb-4 flex flex-wrap gap-1 text-xs" aria-label="Order lifecycle">
        {ORDER_STATUSES.map((s, i) => (
          <li key={s} className={cn("rounded px-2 py-1", i < step ? "bg-emerald-50 text-emerald-700" : i === step ? "bg-hkr-ink font-medium text-white" : "bg-muted text-muted-foreground")}>
            {ORDER_STATUS_LABEL[s]}
          </li>
        ))}
      </ol>

      <Card className="mb-4 border-hkr-accent/40" data-testid="next-action">
        <CardContent className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs text-muted-foreground uppercase">Next action</p>
            <p className="text-sm font-medium">{ORDER_NEXT_ACTION[status]}</p>
          </div>
          <StatusControls orderId={id} status={status} isAdmin={isAdmin} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Lines and totals</CardTitle>
              <CardDescription>
                {o.hk_invoice_no ? `Our invoice ${o.hk_invoice_no}` : "No invoice number yet"}
                {acc.intermediaries ? ` · ${acc.intermediaries.name} invoice ${o.partner_invoice_no ?? "—"} ${o.partner_invoice_eur ? money(o.partner_invoice_eur, "EUR") : ""}` : ""}
                {` · ${PAYMENT_METHOD_LABEL[o.payment_method]} · order date ${formatDate(o.order_date)}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table data-testid="lines-table">
                <TableHeader>
                  <TableRow><TableHead className="pl-4">Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {(lines ?? []).map((l) => {
                    const s = l.skus as { model: string; storage_gb: number; color: string; battery_eligible: boolean } | null;
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="pl-4">{skuLabel(s) || l.description}{l.battery_new && (s?.battery_eligible ?? true) ? <span className="block text-xs text-muted-foreground">New Battery cell 0 Cycle</span> : null}</TableCell>
                        <TableCell className="text-right" data-tabular>{l.qty}</TableCell>
                        <TableCell className="text-right" data-tabular>{money(l.unit_price_usd)}</TableCell>
                        <TableCell className="text-right" data-tabular>{money(l.qty * Number(l.unit_price_usd))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="ml-auto grid max-w-sm gap-1 px-4 pt-3 text-sm" data-tabular data-testid="order-summary">
                <div className="flex justify-between"><span>Products ({o.pieces} pcs)</span><span>{money(o.subtotal_usd)}</span></div>
                {Number(o.battery_line_usd) ? <div className="flex justify-between"><span>New battery cell line</span><span>{money(o.battery_line_usd)}</span></div> : null}
                {Number(o.freight_usd) ? <div className="flex justify-between"><span>Freight</span><span>{money(o.freight_usd)}</span></div> : null}
                {Number(o.customs_usd) ? <div className="flex justify-between"><span>Customs</span><span>{money(o.customs_usd)}</span></div> : null}
                {Number(o.rma_discount_usd) ? <div className="flex justify-between"><span>RMA discount</span><span>−{money(o.rma_discount_usd)}</span></div> : null}
                {Number(o.usdt_fee_usd) ? <div className="flex justify-between"><span>USDT fee</span><span>{money(o.usdt_fee_usd)}</span></div> : null}
                <div className="flex justify-between border-t pt-1 font-semibold"><span>Invoice total</span><span>{money(o.total_usd)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Deposit 10 %</span><span>{money(o.deposit_due_usd)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Balance</span><span>{money(o.balance_due_usd)}</span></div>
                {ov.pays_in_eur ? <div className="flex justify-between text-muted-foreground"><span>Client pays (EUR, intermediary)</span><span>{money(ov.payable_total, "EUR")}</span></div> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice</CardTitle>
              <CardDescription>Draft → Approved (admin) → Sent. Same layout as our commercial invoices; PDF and Excel.</CardDescription>
            </CardHeader>
            <CardContent>
              <InvoicePanel orderId={id} invoice={(invoice ?? null) as InvoiceRow | null} orderTotal={Number(o.total_usd)} role={user.role ?? ""} issuerReady={issuerReady} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>Deposit {money(ov.deposit_payable, cur)} · confirmed {money(Number(ov.deposit_confirmed) + Number(ov.balance_confirmed), cur)} · still due {money(dueDeposit + dueBalance, cur)}</CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentsPanel orderId={id} accountId={acc.id} accountCode={acc.code} orderNumber={o.number} isAdmin={isAdmin}
                payments={(payments ?? []) as never} defaultMethod={o.payment_method} payCurrency={cur} dueDeposit={dueDeposit} dueBalance={dueBalance}
                showForm={editable || dueDeposit + dueBalance > 0} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Shipping day (SOP P4)</CardTitle><CardDescription>Shipment only after the balance is confirmed (brief §6).</CardDescription></CardHeader>
            <CardContent>
              <ShippingPanel orderId={id} accountId={acc.id} accountCode={acc.code} orderNumber={o.number} courier={o.courier} tracking={o.tracking}
                eta={o.eta_date} setup={o.delivery_setup} imeiCount={ov.imei_count ?? 0} labelOk={Boolean(ov.label_ok)} balanceOk={Boolean(ov.balance_ok)} />
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          {isAdmin ? (
            <Card data-testid="finance">
              <CardHeader><CardTitle>Finance (admin only)</CardTitle></CardHeader>
              <CardContent className="grid gap-1 text-sm" data-tabular>
                <div className="flex justify-between"><span>Base cost</span><span>{money(finance.data?.base_cost_usd ?? null)}</span></div>
                <div className="flex justify-between"><span>Margin</span><span>{finance.data?.margin_pct != null ? `${Number(finance.data.margin_pct).toFixed(2)} %` : "—"}</span></div>
                <div className="flex justify-between"><span>Profit</span><span>{finance.data?.base_cost_usd != null ? money(Number(o.total_usd) - Number(finance.data.base_cost_usd)) : "—"}</span></div>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Delivery</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <div><span className="text-muted-foreground">Set-up: </span>{DELIVERY_SETUP_LABEL[o.delivery_setup]}</div>
              <div><span className="text-muted-foreground">Ship to: </span>{[ship.name, ship.address, ship.city, ship.country ? countryName(ship.country) : ""].filter(Boolean).join(", ") || "—"}</div>
              {ship.contact || ship.phone ? <div><span className="text-muted-foreground">Reception: </span>{[ship.contact, ship.phone].filter(Boolean).join(" · ")}</div> : null}
              <div><span className="text-muted-foreground">ETA: </span>{formatDate(o.eta_date)}{!o.eta_date && ["deposit_paid", "in_preparation"].includes(status) ? <span className="text-amber-700"> · ETA pending</span> : null}</div>
              <div><span className="text-muted-foreground">Shipped: </span>{formatDate(o.ship_date)}{o.tracking ? ` · ${o.courier ?? ""} ${o.tracking}` : ""}</div>
              {o.delivered_date ? <div><span className="text-muted-foreground">Delivered: </span>{formatDate(o.delivered_date)}</div> : null}
              {o.notes ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{o.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <FileUpload accountId={acc.id} accountCode={acc.code} orderId={id} orderNumber={o.number} testId="order-file-upload" />
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {(files ?? []).map((f) => (
                <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex justify-between gap-2 hover:underline">
                  <span className="truncate">{f.file_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{FILE_KINDS.find((k) => k.kind === f.kind)?.kind}</span>
                </a>
              ))}
              {!files?.length ? <p className="text-muted-foreground">No documents yet (INV-HK, PP-DEP, IMEI, label, TRK, POD…).</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <NoteForm orderId={id} accountId={acc.id} />
              <ul className="grid gap-2 text-sm" data-testid="order-timeline">
                {(events ?? []).map((e) => (
                  <li key={e.id} className="border-l-2 pl-2">
                    <span className="block text-xs text-muted-foreground">{formatDateTime(e.created_at, user.timezone)} · {e.user_id ? names.get(e.user_id) ?? "—" : "System"}</span>
                    {e.kind === "status"
                      ? e.from_status ? `${ORDER_STATUS_LABEL[e.from_status as OrderStatus]} → ${ORDER_STATUS_LABEL[e.to_status as OrderStatus]}` : `${e.body ?? "Created"} (${ORDER_STATUS_LABEL[e.to_status as OrderStatus]})`
                      : e.body}
                    {e.file_id ? <a href={`/api/files/${e.file_id}`} target="_blank" rel="noreferrer" className="ml-1 text-xs underline">file</a> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
