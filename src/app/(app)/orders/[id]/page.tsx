import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadTeam } from "@/lib/leads/service";
import { countryName } from "@/lib/leads/countries";
import { formatDate, formatDateTime } from "@/lib/format";
import { skuLabel } from "@/lib/orders/service";
import { BATTERY_OPTIONS, colorLabel, colorsFor } from "@/lib/orders/colors";

const colorLabelOf = (model: string | null, name: string) => { const c = colorsFor(model).find((x) => x.name === name); return c ? colorLabel(c) : name; };
import {
  DELIVERY_SETUP_LABEL, FILE_KINDS, ORDER_NEXT_ACTION, ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, money, type OrderStatus,
} from "@/lib/orders/constants";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";
import { OrderStatusBadge } from "@/components/accounts/badges";
import { NoteForm, PaymentsPanel, ShippingPanel, StatusControls } from "@/components/orders/order-panels";
import { FileUpload } from "@/components/orders/file-upload";
import { InvoicePanel, type InvoiceRow } from "@/components/orders/invoice-panel";
import { IntermediaryPanel } from "@/components/orders/intermediary-panel";
import { CreditNotesPanel } from "@/components/orders/credit-notes-panel";
import { OrderIndicators, OrderTabs } from "@/components/orders/order-tabs";
import { RealtimeRefresh } from "@/components/whatsapp/realtime-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const isAdmin = user.role === "admin";
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";
  const db = await createClient();

  const { data: o } = await db.from("orders").select("*, accounts(id, code, name, country, invoice_format, billing_entity, intermediaries(name))").eq("id", id).maybeSingle();
  if (!o) notFound();
  const acc = o.accounts as unknown as { id: string; code: string; name: string; country: string | null; invoice_format: { battery_line_separate?: boolean } | null; intermediaries: { name: string } | null };

  const [{ data: ov }, { data: lines }, { data: payments }, { data: events }, { data: files }, team, finance, { data: invoice }, { data: issuers }, { data: cnApplied }, { data: cnAll }, { data: intermediaries }, { data: charges }, { data: feeSetting }] = await Promise.all([
    db.from("order_overview").select("*").eq("id", id).single(),
    db.from("order_lines").select("id, qty, unit_price_usd, battery_new, battery_unit_usd, battery_option, description, model, storage_gb, colors_mixed, colors, ce_marked, imei_matching_color, price_source, skus(model, storage_gb, color, battery_eligible)").eq("order_id", id).order("sort_order"),
    db.from("payments").select("*").eq("order_id", id).order("created_at"),
    db.from("order_events").select("id, kind, from_status, to_status, body, file_id, user_id, created_at").eq("order_id", id).order("created_at", { ascending: false }).limit(100),
    db.from("files").select("id, kind, file_name, created_at").eq("owner_table", "orders").eq("owner_id", id).order("created_at", { ascending: false }),
    loadTeam(db),
    isAdmin ? db.from("orders_finance").select("base_cost_usd, real_cost_usd, margin_pct, financial_loss_usd").eq("order_id", id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("invoices").select("id, number, status, version, invoice_date, consignee, ship_to, notify, shipment, lines, total_usd, file_pdf_id, file_xlsx_id").eq("order_id", id).neq("status", "void").maybeSingle(),
    db.from("settings").select("value").eq("key", "invoice_issuers").maybeSingle(),
    db.from("credit_note_applications").select("id, credit_note_id, amount_usd, credit_notes(number)").eq("order_id", id).order("created_at"),
    db.from("credit_notes").select("id, number, amount, currency, status, reason, rmas(number), credit_note_applications(amount_usd)")
      .eq("account_id", acc.id).in("status", ["approved", "issued", "applied"]).order("number"),
    db.from("intermediaries").select("id, name, kind, account_intermediaries(account_id)").order("name"),
    db.from("order_charges").select("description, qty, unit_usd, amount_usd").eq("order_id", id).order("sort_order"),
    db.from("settings").select("value").eq("key", "usdt_fee_pct").maybeSingle(),
  ]);
  const imName = (intermediaries ?? []).find((i) => i.id === o.intermediary_id)?.name ?? null;
  const appliedCn = (cnApplied ?? []).map((a) => ({ id: a.id, credit_note_id: a.credit_note_id, number: (a.credit_notes as unknown as { number: string }).number, amount: Number(a.amount_usd) }));
  const availableCn = (cnAll ?? []).filter((c) => c.currency === "USD").map((c) => {
    const used = ((c.credit_note_applications ?? []) as { amount_usd: number }[]).reduce((t, x) => t + Number(x.amount_usd), 0);
    return { id: c.id, number: c.number, amount: Number(c.amount), left: Math.round((Number(c.amount) - used) * 100) / 100, reason: c.reason,
      rma: (c.rmas as unknown as { number: string } | null)?.number ?? null };
  }).filter((c) => c.left > 0 && !appliedCn.some((a) => a.credit_note_id === c.id));
  const billingEntity = (o as unknown as { accounts: { billing_entity?: string } }).accounts.billing_entity ?? "ever_state";
  const issuerReady = Boolean(((issuers?.value ?? {}) as Record<string, { company?: string }>)[billingEntity]?.company);
  if (!ov) notFound();
  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));
  const status = o.status as OrderStatus;
  const cur = "USD"; // we are always paid in USD, also via an intermediary (Gabriel, Nov 2 2026)
  const cents = (n: number) => Math.round(n * 100) / 100;
  const dueDeposit = Math.max(0, cents(Number(ov.deposit_payable) - Number(ov.deposit_confirmed)));
  const dueBalance = Math.max(0, cents(Number(ov.payable_total) - Number(ov.deposit_payable) - Number(ov.balance_confirmed)));
  // indicators (Gabriel, Nov 3 2026): what the client owes, what reached us, what waits for an admin
  const received = (payments ?? []).filter((p) => p.status === "confirmed").reduce((t, p) => t + Number(p.amount), 0);
  const awaiting = (payments ?? []).filter((p) => p.status !== "confirmed").reduce((t, p) => t + Number(p.amount), 0);
  const stillDue = Math.max(0, Math.round((Number(o.total_usd) - received) * 100) / 100);
  const nextDue = status === "quoted" ? null
    : dueDeposit > 0 ? { label: "Deposit due", amount: dueDeposit }
    : dueBalance > 0 ? { label: status === "ready_to_ship" ? "Balance due now" : "Balance due when ready", amount: dueBalance } : null;
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
          <span className="ml-auto flex gap-2">
            <Button asChild size="sm" variant="ghost"><Link href={`/dashboard/escalations?account=${acc.id}&order=${id}`}>Ask the SD</Link></Button>
            {editable ? <Button asChild size="sm" variant="outline"><Link href={`/orders/${id}/edit`}>Edit order</Link></Button> : null}
          </span>
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

      <OrderIndicators total={Number(o.total_usd)} received={received} awaiting={awaiting} due={stillDue} nextDue={nextDue} />

      <OrderTabs initial={tab} tabs={[
        { key: "overview", label: "Overview" },
        { key: "payments", label: "Payments", count: (payments ?? []).length, alert: awaiting > 0 },
        { key: "invoice", label: "Invoice", note: invoice ? invoice.status : undefined },
        { key: "credit-notes", label: "Credit notes", count: appliedCn.length },
        { key: "intermediary", label: "Intermediary" },
        { key: "shipping", label: "Shipping" },
        { key: "documents", label: "Documents", count: (files ?? []).length },
        { key: "timeline", label: "Timeline & notes", count: (events ?? []).length },
        ...(isAdmin ? [{ key: "finance", label: "Finance" }] : []),
      ]}>
        <div data-tab="overview" className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Lines and totals</CardTitle>
              <CardDescription>
                {o.hk_invoice_no ? `Our invoice ${o.hk_invoice_no}` : "No invoice number yet"}
                {imName ? ` · ${imName} invoice ${o.partner_invoice_no ?? "pending"}${o.partner_invoice_eur ? ` (${money(o.partner_invoice_eur, "EUR")})` : ""}` : " · direct"}
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
                    const split = (l.colors as { color: string; qty: number }[]) ?? [];
                    const colorTxt = split.length ? split.map((c) => `${colorLabelOf(l.model, c.color)} ${c.qty}`).join(" · ") : l.colors_mixed ? "Mixed colours" : s?.color ?? "";
                    const opts = [BATTERY_OPTIONS.find((b) => b.value === l.battery_option)?.label, l.ce_marked ? "CE Marks" : null, l.imei_matching_color ? "IMEI matching color" : null, l.price_source === "manual" ? "manual price" : null].filter(Boolean).join(" · ");
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="pl-4">
                          {l.model ? `${l.model} ${l.storage_gb ? `${l.storage_gb}GB` : ""}` : skuLabel(s) || l.description}
                          {colorTxt ? <span className="block text-xs text-muted-foreground">{colorTxt}</span> : null}
                          {opts ? <span className="block text-xs text-muted-foreground">{opts}</span> : null}
                        </TableCell>
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
                {Number(o.freight_usd) ? <div className="flex justify-between"><span>Shipping{o.freight_mode === "unit" ? ` (${o.pieces} × ${money(o.freight_unit_usd ?? 0)})` : ""}</span><span>{money(o.freight_usd)}</span></div> : null}
                {Number(o.customs_usd) ? <div className="flex justify-between"><span>Customs{o.customs_mode === "unit" ? ` (${o.pieces} × ${money(o.customs_unit_usd ?? 0)})` : ""}</span><span>{money(o.customs_usd)}</span></div> : null}
                {(charges ?? []).map((c, i) => (
                  <div key={i} className="flex justify-between gap-3" data-testid="summary-charge"><span>{c.description}{c.qty !== null ? ` (${c.qty} × ${money(c.unit_usd ?? 0)})` : ""}</span><span className={Number(c.amount_usd) < 0 ? "text-emerald-700" : ""}>{Number(c.amount_usd) < 0 ? "−" : ""}{money(Math.abs(Number(c.amount_usd)))}</span></div>
                ))}
                {Number(o.rma_discount_usd) ? <div className="flex justify-between"><span>{appliedCn.length ? `Credit notes (${appliedCn.map((a) => a.number).join(", ")})` : "RMA discount"}</span><span>−{money(o.rma_discount_usd)}</span></div> : null}
                {Number(o.usdt_fee_usd) ? <div className="flex justify-between"><span>USDT fee</span><span>{money(o.usdt_fee_usd)}</span></div> : null}
                <div className="flex justify-between border-t pt-1 font-semibold"><span>Invoice total</span><span>{money(o.total_usd)}</span></div>
                {ov.deposit_with_intermediary ? (
                  <div className="flex justify-between text-muted-foreground"><span>Deposit kept by the intermediary · we receive 100 %</span><span>{money(o.total_usd)}</span></div>
                ) : (
                  <>
                    <div className="flex justify-between text-muted-foreground"><span>Deposit 10 %</span><span>{money(o.deposit_due_usd)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Balance</span><span>{money(o.balance_due_usd)}</span></div>
                  </>
                )}
                {o.partner_invoice_eur ? <div className="flex justify-between text-muted-foreground"><span>Client pays the intermediary (EUR, reference)</span><span>{money(o.partner_invoice_eur, "EUR")}</span></div> : null}
                {(() => {
                  const f = (o.invoice_format ?? {}) as { battery_line_separate?: boolean; show_ce_text?: boolean; plain_lines?: boolean; show_note?: boolean };
                  const parts = [f.battery_line_separate !== false ? "separate battery line" : "battery in the price", f.show_ce_text ? "CE Marks" : null, f.plain_lines ? "plain lines" : null, f.show_note ? "note" : null].filter(Boolean);
                  return <p className="pt-1 text-xs text-muted-foreground" data-testid="order-format">Invoice format of this order: {parts.join(" · ")} (Edit order to change it)</p>;
                })()}
              </div>
            </CardContent>
          </Card>
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
        </div>
        <div data-tab="payments"><Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>What the client owes on this order and what we received, like an account statement. A proof counts only after an admin confirms it (SOP P3).</CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentsPanel orderId={id} accountId={acc.id} accountCode={acc.code} orderNumber={o.number} isAdmin={isAdmin}
                payments={(payments ?? []) as never} defaultMethod={o.payment_method} payCurrency={cur} dueDeposit={dueDeposit} dueBalance={dueBalance}
                showForm={editable || dueDeposit + dueBalance > 0} usdtFeePct={Number(feeSetting?.value ?? 0.85) || 0.85}
                ledger={{ date: o.order_date, label: o.hk_invoice_no ? `Invoice ${o.hk_invoice_no}` : `Order ${o.number} (invoice not approved yet)`, total: Number(o.total_usd),
                  note: appliedCn.length ? `includes credit notes ${appliedCn.map((a) => `${a.number} −${money(a.amount)}`).join(", ")}` : null }} />
            </CardContent>
          </Card></div>
        <div data-tab="invoice"><Card>
            <CardHeader>
              <CardTitle>Invoice</CardTitle>
              <CardDescription>Draft → Approved (admin) → Sent. Same layout as our commercial invoices; PDF and Excel.</CardDescription>
            </CardHeader>
            <CardContent>
              <InvoicePanel orderId={id} invoice={(invoice ?? null) as InvoiceRow | null} orderTotal={Number(o.total_usd)} role={user.role ?? ""} issuerReady={issuerReady} />
            </CardContent>
          </Card></div>
        <div data-tab="credit-notes"><Card>
            <CardHeader>
              <CardTitle>Credit notes</CardTitle>
              <CardDescription>The discount on this invoice comes from approved credit notes of the client (with or without RMA / IMEIs). One credit note can be split across several invoices.</CardDescription>
            </CardHeader>
            <CardContent>
              <CreditNotesPanel orderId={id} accountId={acc.id} applied={appliedCn} available={availableCn} isAdmin={isAdmin}
                canEdit={user.role === "admin" || user.role === "account_specialist"} frozen={Boolean(invoice && ["approved", "sent"].includes(invoice.status))} />
            </CardContent>
          </Card></div>
        <div data-tab="intermediary"><Card>
            <CardHeader>
              <CardTitle>Intermediary{imName ? ` (${imName})` : " — direct order"}</CardTitle>
              <CardDescription>{imName ? `We invoice ${imName} in USD → they invoice the client in EUR → the client pays them → they pay us in USD.` : "Choose the company if this order goes through an intermediary (Global Connect, Galimix, DWT…)."} The client&apos;s usual intermediary is only the default for new orders.</CardDescription>
            </CardHeader>
            <CardContent>
              <IntermediaryPanel orderId={id} accountId={acc.id} accountCode={acc.code} orderNumber={o.number}
                intermediaryId={o.intermediary_id} intermediaries={(intermediaries ?? []).map((i) => ({ id: i.id, name: i.name, kind: i.kind, saved: (i.account_intermediaries ?? []).some((x) => x.account_id === acc.id) }))} isAdmin={isAdmin}
                no={o.partner_invoice_no} eur={o.partner_invoice_eur === null ? null : Number(o.partner_invoice_eur)}
                depositWithIntermediary={Boolean(o.deposit_with_intermediary)} editable={editable} />
            </CardContent>
          </Card></div>
        <div data-tab="shipping"><Card>
            <CardHeader><CardTitle>Shipping day (SOP P4)</CardTitle><CardDescription>Shipment only after the balance is confirmed (brief §6).</CardDescription></CardHeader>
            <CardContent>
              <ShippingPanel orderId={id} accountId={acc.id} accountCode={acc.code} orderNumber={o.number} courier={o.courier} tracking={o.tracking}
                eta={o.eta_date} setup={o.delivery_setup} imeiCount={ov.imei_count ?? 0} labelOk={Boolean(ov.label_ok)} balanceOk={Boolean(ov.balance_ok)} />
            </CardContent>
          </Card></div>
        <div data-tab="documents"><Card>
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
          </Card></div>
        <div data-tab="timeline"><Card>
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
          </Card></div>
        {isAdmin ? <div data-tab="finance"><Card data-testid="finance">
              <CardHeader><CardTitle>Finance (admin only)</CardTitle></CardHeader>
              <CardContent className="grid gap-1 text-sm" data-tabular>
                {/* the profit is worked out on the invoice total, which already has the applied credit notes taken off */}
                <div className="flex justify-between font-medium" data-testid="fin-invoice-total"><span>Invoice total{Number(o.rma_discount_usd) ? " (after credit notes)" : ""}</span><span>{money(o.total_usd)}</span></div>
                {Number(o.rma_discount_usd) ? (
                  <div className="flex justify-between text-muted-foreground" data-testid="fin-credit-notes"><span>· credit notes applied ({appliedCn.map((a) => a.number).join(", ") || "RMA discount"})</span><span>−{money(o.rma_discount_usd)}</span></div>
                ) : null}
                <div className="flex justify-between text-muted-foreground"><span>Base list price</span><span>{money(finance.data?.base_cost_usd ?? null)}</span></div>
                <div className="flex justify-between"><span>Real cost (base ÷ 1 + base margin)</span><span>{money(finance.data?.real_cost_usd ?? null)}</span></div>
                {Number(finance.data?.financial_loss_usd) > 0 ? (
                  <div className="flex justify-between text-destructive" data-testid="financial-loss"><span>Financial loss (USDT fee not received)</span><span>−{money(finance.data!.financial_loss_usd)}</span></div>
                ) : null}
                <div className="flex justify-between"><span>Profit</span><span data-testid="profit">{finance.data?.real_cost_usd != null ? money(Number(o.total_usd) - Number(finance.data.real_cost_usd) - Number(finance.data.financial_loss_usd ?? 0)) : "—"}</span></div>
                <div className="flex justify-between font-medium" title="Profit ÷ invoice total: which part of what the client pays is profit"><span>Margin (profit ÷ invoice total)</span><span data-testid="margin">{finance.data?.margin_pct != null ? `${Number(finance.data.margin_pct).toFixed(2)} %` : "—"}</span></div>
                <div className="flex justify-between font-medium" title="Profit ÷ real cost: how much was added on top of what the phones cost"><span>Markup (profit ÷ real cost)</span><span data-testid="markup">{finance.data?.real_cost_usd ? `${((Number(o.total_usd) - Number(finance.data.real_cost_usd) - Number(finance.data.financial_loss_usd ?? 0)) / Number(finance.data.real_cost_usd) * 100).toFixed(2)} %` : "—"}</span></div>
              </CardContent>
            </Card></div> : null}
      </OrderTabs>
    </>
  );
}
