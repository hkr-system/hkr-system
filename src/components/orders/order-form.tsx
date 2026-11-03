"use client";

import { useActionState, useMemo, useState } from "react";
import { saveOrder, type ActionState } from "@/app/(app)/orders/actions";
import { orderTotals } from "@/lib/orders/calc";
import { DELIVERY_SETUP_LABEL, PAYMENT_METHOD_LABEL, money, type DeliverySetup, type PaymentMethod } from "@/lib/orders/constants";
import { countryOptions } from "@/lib/leads/countries";
import { modelKey } from "@/lib/price-lists/models";
import { batteryLineEligible } from "@/lib/orders/colors";
import { AddLineButton, LineEditor, MagicReader, emptyLine, lineProblem, lineToPayload, withChoice, type Line, type ModelChoice } from "./order-lines";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type FormAccount = {
  id: string; code: string; name: string; payment_method: PaymentMethod; delivery_setup: DeliverySetup;
  has_intermediary: boolean; battery_line_separate: boolean; country: string | null; legal_name: string | null; orders: number;
  ce_default?: boolean;   // invoice format "show CE text" → CE Marks ticked on new lines
  ship_default?: Record<string, string>;   // last order's ship-to, else the account's own address
  invoice_format?: { battery_line_separate: boolean; show_ce_text: boolean; plain_lines: boolean; show_note: boolean }; // the client's default
};
type Sku = { id: string; label: string; battery_eligible: boolean; model: string; storage_gb: number };
/** Approved list per account: "<model>|<gb>" → row (loadApprovedPrices). */
export type AccountPrices = Record<string, { version: number; validUntil: string | null; rows: Record<string, { id: string; model: string; storage_gb: number; note: string | null; price: number; floor: number | null }> }>;
export type { Line } from "./order-lines";

export type OrderValues = {
  id?: string; account_id?: string; order_date?: string; payment_method?: PaymentMethod; delivery_setup?: DeliverySetup;
  hk_invoice_no?: string | null; partner_invoice_no?: string | null; partner_invoice_eur?: number | null;
  freight_usd?: number; customs_usd?: number; rma_discount_usd?: number; eta_date?: string | null; notes?: string | null;
  ship_to?: Record<string, string>; lines?: Line[];
  invoice_format?: { battery_line_separate?: boolean; show_ce_text?: boolean; plain_lines?: boolean; show_note?: boolean } | null;
};

const FORMAT_OPTIONS = [
  ["battery_line_separate", "Separate “New battery cell” line (otherwise absorbed in the price)"],
  ["show_ce_text", "CE Marks on new lines (ticked by default)"],
  ["plain_lines", "Plain lines: only “Used iPhone 12 128GB” (no battery, CE, IMEI or colours)"],
  ["show_note", "Show note"],
] as const;
type Fmt = Record<(typeof FORMAT_OPTIONS)[number][0], boolean>;

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`grid gap-1.5 ${className ?? ""}`}><Label>{label}</Label>{children}</div>;
}

export function OrderForm({ accounts, skus, values = {}, isAdmin, terms, prices = {} }: {
  accounts: FormAccount[]; skus: Sku[]; values?: OrderValues; isAdmin: boolean; prices?: AccountPrices;
  terms: { depositPct: number; usdtFeePct: number; moqUsd: number; sampleMinUsd: number };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveOrder, {});
  const fmtOf = (id: string): Fmt => ({ battery_line_separate: true, show_ce_text: false, plain_lines: false, show_note: false, ...(accounts.find((a) => a.id === id)?.invoice_format ?? {}) });
  const [fmt, setFmt] = useState<Fmt>(() => (values.invoice_format && Object.keys(values.invoice_format).length
    ? { ...fmtOf(values.account_id ?? ""), ...values.invoice_format } as Fmt
    : fmtOf(values.account_id ?? (accounts.length === 1 ? accounts[0].id : ""))));
  const ceOf = (id: string) => (id === (values.account_id ?? "") && values.invoice_format ? Boolean(fmt.show_ce_text) : fmtOf(id).show_ce_text);
  const [accountId, setAccountId] = useState(values.account_id ?? (accounts.length === 1 ? accounts[0].id : ""));
  const account = accounts.find((a) => a.id === accountId);
  const [method, setMethod] = useState<PaymentMethod>(values.payment_method ?? account?.payment_method ?? "wire");
  const [setup, setSetup] = useState<DeliverySetup>(values.delivery_setup ?? account?.delivery_setup ?? "client_label");
  const [lines, setLines] = useState<Line[]>(values.lines?.length ? values.lines : [emptyLine(ceOf(values.account_id ?? ""))]);
  const [freight, setFreight] = useState(String(values.freight_usd ?? 0));
  const [customs, setCustoms] = useState(String(values.customs_usd ?? 0));
  const rma = String(values.rma_discount_usd ?? 0); // credit notes applied on the order page (Nov 3 2026), never typed
  const shipFor = (id: string) => accounts.find((a) => a.id === id)?.ship_default ?? {};
  const [ship, setShip] = useState<Record<string, string>>(
    values.ship_to && Object.values(values.ship_to).some(Boolean) ? values.ship_to : shipFor(values.account_id ?? (accounts.length === 1 ? accounts[0].id : "")));
  const setS = (k: string) => (e: { target: { value: string } }) => setShip((s) => ({ ...s, [k]: e.target.value }));
  const separate = fmt.battery_line_separate;
  // model choices: the client's approved price list; without one, the models of the SKUs
  const choicesFor = (acc: string): ModelChoice[] => {
    const rows = prices[acc]?.rows;
    if (rows && Object.keys(rows).length) {
      return Object.entries(rows).map(([key, r]) => ({ key, model: r.model, storage_gb: r.storage_gb, note: r.note, rowId: r.id, price: r.price, floor: r.floor }));
    }
    const seen = new Map<string, ModelChoice>();
    for (const k of skus) { const key = modelKey(k.model, k.storage_gb); if (!seen.has(key)) seen.set(key, { key, model: k.model, storage_gb: k.storage_gb, note: null }); }
    return [...seen.values()];
  };
  const choices = useMemo(() => choicesFor(accountId), [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const problems = lines.map(lineProblem).filter(Boolean) as string[];

  const t = orderTotals({
    lines: lines.map((l) => ({
      qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0, batteryNew: l.battery === "new",
      batteryUnit: Number(l.battery_unit) || 0, batteryEligible: batteryLineEligible(l.model),
    })),
    batteryLineSeparate: separate, freight: Number(freight) || 0, customs: Number(customs) || 0, rmaDiscount: Number(rma) || 0,
    paymentMethod: method, depositPct: terms.depositPct, usdtFeePct: terms.usdtFeePct,
  });
  const firstOrder = account ? account.orders === 0 && !values.id : false;
  const minimum = firstOrder ? terms.sampleMinUsd : terms.moqUsd;

  const setLine = (i: number, patch: Partial<Line> | ((l: Line) => Line)) =>
    setLines((ls) => ls.map((l, j) => (j === i ? (typeof patch === "function" ? patch(l) : { ...l, ...patch }) : l)));
  const pickAccount = (id: string) => {
    setAccountId(id);
    const a = accounts.find((x) => x.id === id);
    if (a) { setMethod(a.payment_method); setSetup(a.delivery_setup); }
    if (!values.id) setFmt(fmtOf(id));
    if (!values.id) setShip(shipFor(id));
    const next = choicesFor(id);
    setLines((ls) => ls.map((l) => (l.model ? withChoice(l, next.find((c) => c.key === modelKey(l.model, l.storage_gb ?? 0))) : { ...l, ce: ceOf(id) })));
  };
  const list = accountId ? prices[accountId] : undefined;

  return (
    <form action={action} className="grid gap-4" data-testid="order-form">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="lines" value={JSON.stringify(lines.map(lineToPayload))} />
      <input type="hidden" name="invoice_format" value={JSON.stringify(fmt)} />

      <Card>
        <CardHeader><CardTitle className="text-base">Order</CardTitle><CardDescription>SOP P2. The order number (ORD-NN) is given automatically per account.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <F label="Account *">
            <NativeSelect name="account_id" value={accountId} onChange={(e) => pickAccount(e.target.value)} disabled={Boolean(values.id)} required data-testid="order-account">
              <option value="">Choose…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </NativeSelect>
          </F>
          <F label="Order date"><Input type="date" name="order_date" defaultValue={values.order_date ?? new Date().toISOString().slice(0, 10)} /></F>
          <F label="ETA (ready date from HK)"><Input type="date" name="eta_date" defaultValue={values.eta_date ?? ""} /></F>
          <F label="Payment method">
            <NativeSelect name="payment_method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </NativeSelect>
          </F>
          <F label="Delivery set-up">
            <NativeSelect name="delivery_setup" value={setup} onChange={(e) => setSetup(e.target.value as DeliverySetup)}>
              {Object.entries(DELIVERY_SETUP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </NativeSelect>
          </F>
          <F label="Our invoice no. (INV-HK)"><Input value={values.hk_invoice_no ?? ""} placeholder="Given automatically by the invoice (CODE-INV-NN)" disabled readOnly /></F>
          {account?.has_intermediary ? (
            <p className="text-sm text-muted-foreground sm:col-span-3">Via an intermediary: add their invoice (number, EUR amount) on the order page when it arrives. They pay us in USD.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
          <CardDescription>
            {account ? list ? `Unit prices come from the client's approved price list v${list.version}; a different price is marked “manual” and logged.` : "This client has no approved price list yet: type the unit prices." : "Choose the account first."}
            {account ? separate ? " This account shows a separate “New battery cell” line (iPhone 16 series never carries it)." : " This account has the battery absorbed in the unit price." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {!values.id ? (
            <MagicReader choices={choices} ceDefault={ceOf(accountId)} disabled={!accountId}
              onLines={(ls) => setLines((cur) => [...cur.filter((l) => l.model || l.description || l.qty), ...ls])} />
          ) : null}
          {lines.map((l, i) => (
            <LineEditor key={i} line={l} i={i} choices={choices} isAdmin={isAdmin} separate={separate}
              onChange={(p) => setLine(i, p)} onRemove={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [emptyLine(ceOf(accountId))]))} />
          ))}
          <AddLineButton onAdd={() => setLines((ls) => [...ls, emptyLine(ceOf(accountId))])} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle className="text-base">Ship to (this order)</CardTitle><CardDescription>Filled in from the client&apos;s last order (or its account data for a first order); change it if this order goes elsewhere.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <F label="Consignee"><Input name="ship_name" value={ship.name ?? ""} onChange={setS("name")} /></F>
            <F label="Reception contact"><Input name="ship_contact" value={ship.contact ?? ""} onChange={setS("contact")} /></F>
            <F label="Address" className="sm:col-span-2"><Input name="ship_address" value={ship.address ?? ""} onChange={setS("address")} /></F>
            <F label="City"><Input name="ship_city" value={ship.city ?? ""} onChange={setS("city")} /></F>
            <F label="Country">
              <NativeSelect name="ship_country" value={ship.country ?? ""} onChange={setS("country")}>
                <option value="">—</option>
                {countryOptions("en").map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </NativeSelect>
            </F>
            <F label="Phone"><Input name="ship_phone" value={ship.phone ?? ""} onChange={setS("phone")} /></F>
            <F label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} defaultValue={values.notes ?? ""} /></F>
          </CardContent>
        </Card>

        <Card data-testid="invoice-format">
          <CardHeader><CardTitle className="text-base">Invoice format (this order)</CardTitle><CardDescription>Taken from the client&apos;s default; change it for this invoice only.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {FORMAT_OPTIONS.map(([k, label]) => (
              <label key={k} className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={fmt[k]} data-testid={`fmt-${k}`}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setFmt((f) => ({ ...f, [k]: on }));
                    if (k === "show_ce_text") setLines((ls) => ls.map((l) => ({ ...l, ce: on })));
                  }} />
                <span>{label}</span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card data-testid="order-totals">
          <CardHeader><CardTitle className="text-base">Totals (US$)</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm" data-tabular>
            <div className="flex justify-between"><span>Products ({t.pieces} pcs)</span><span>{money(t.subtotal)}</span></div>
            {separate ? <div className="flex justify-between"><span>New battery cell line</span><span>{money(t.battery)}</span></div> : null}
            <div className="flex items-center justify-between gap-2"><span>Freight</span><Input name="freight_usd" value={freight} onChange={(e) => setFreight(e.target.value)} inputMode="decimal" className="h-7 w-28 text-right" /></div>
            <div className="flex items-center justify-between gap-2"><span>Customs</span><Input name="customs_usd" value={customs} onChange={(e) => setCustoms(e.target.value)} inputMode="decimal" className="h-7 w-28 text-right" /></div>
            {Number(rma) ? <div className="flex items-center justify-between gap-2" title="Applied on the order page from approved credit notes"><span>Credit notes (−)</span><span className="tabular-nums">{Number(rma).toFixed(2)}</span></div> : null}
            {method === "usdt" ? <div className="flex justify-between"><span>USDT fee {terms.usdtFeePct} %</span><span>{money(t.usdtFee)}</span></div> : null}
            <div className="flex justify-between border-t pt-2 font-semibold"><span>Invoice total</span><span data-testid="total">{money(t.total)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Deposit {terms.depositPct} %</span><span data-testid="deposit">{money(t.deposit)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Balance before shipment</span><span>{money(t.balance)}</span></div>
            {account && t.total > 0 && t.total < minimum ? (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800" role="status">
                Below the {firstOrder ? "sample-order" : "order"} minimum of {money(minimum)}. The SOP says: escalate to the Sales Director.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || problems.length > 0}>{pending ? "Saving…" : values.id ? "Save order" : "Create order"}</Button>
        {problems.length ? <p className="text-sm text-destructive" role="alert" data-testid="lines-problem">Fix the colours first: {problems[0]}</p> : null}
        {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      </div>
    </form>
  );
}
