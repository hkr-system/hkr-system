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
};

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`grid gap-1.5 ${className ?? ""}`}><Label>{label}</Label>{children}</div>;
}

export function OrderForm({ accounts, skus, values = {}, isAdmin, terms, prices = {} }: {
  accounts: FormAccount[]; skus: Sku[]; values?: OrderValues; isAdmin: boolean; prices?: AccountPrices;
  terms: { depositPct: number; usdtFeePct: number; moqUsd: number; sampleMinUsd: number };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveOrder, {});
  const ceOf = (id: string) => accounts.find((a) => a.id === id)?.ce_default ?? false;
  const [accountId, setAccountId] = useState(values.account_id ?? (accounts.length === 1 ? accounts[0].id : ""));
  const account = accounts.find((a) => a.id === accountId);
  const [method, setMethod] = useState<PaymentMethod>(values.payment_method ?? account?.payment_method ?? "wire");
  const [setup, setSetup] = useState<DeliverySetup>(values.delivery_setup ?? account?.delivery_setup ?? "client_label");
  const [lines, setLines] = useState<Line[]>(values.lines?.length ? values.lines : [emptyLine(ceOf(values.account_id ?? ""))]);
  const [freight, setFreight] = useState(String(values.freight_usd ?? 0));
  const [customs, setCustoms] = useState(String(values.customs_usd ?? 0));
  const [rma, setRma] = useState(String(values.rma_discount_usd ?? 0));
  const ship = values.ship_to ?? {};
  const separate = account?.battery_line_separate ?? true;
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
    const next = choicesFor(id);
    setLines((ls) => ls.map((l) => (l.model ? withChoice(l, next.find((c) => c.key === modelKey(l.model, l.storage_gb ?? 0))) : { ...l, ce: ceOf(id) })));
  };
  const list = accountId ? prices[accountId] : undefined;

  return (
    <form action={action} className="grid gap-4" data-testid="order-form">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="lines" value={JSON.stringify(lines.map(lineToPayload))} />

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
          <CardHeader><CardTitle className="text-base">Ship to (this order)</CardTitle><CardDescription>Brief §6: the delivery address can change per order.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <F label="Consignee"><Input name="ship_name" defaultValue={ship.name ?? account?.legal_name ?? ""} /></F>
            <F label="Reception contact"><Input name="ship_contact" defaultValue={ship.contact ?? ""} /></F>
            <F label="Address" className="sm:col-span-2"><Input name="ship_address" defaultValue={ship.address ?? ""} /></F>
            <F label="City"><Input name="ship_city" defaultValue={ship.city ?? ""} /></F>
            <F label="Country">
              <NativeSelect name="ship_country" defaultValue={ship.country ?? account?.country ?? ""}>
                <option value="">—</option>
                {countryOptions("en").map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </NativeSelect>
            </F>
            <F label="Phone"><Input name="ship_phone" defaultValue={ship.phone ?? ""} /></F>
            <F label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} defaultValue={values.notes ?? ""} /></F>
          </CardContent>
        </Card>

        <Card data-testid="order-totals">
          <CardHeader><CardTitle className="text-base">Totals (US$)</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm" data-tabular>
            <div className="flex justify-between"><span>Products ({t.pieces} pcs)</span><span>{money(t.subtotal)}</span></div>
            {separate ? <div className="flex justify-between"><span>New battery cell line</span><span>{money(t.battery)}</span></div> : null}
            <div className="flex items-center justify-between gap-2"><span>Freight</span><Input name="freight_usd" value={freight} onChange={(e) => setFreight(e.target.value)} inputMode="decimal" className="h-7 w-28 text-right" /></div>
            <div className="flex items-center justify-between gap-2"><span>Customs</span><Input name="customs_usd" value={customs} onChange={(e) => setCustoms(e.target.value)} inputMode="decimal" className="h-7 w-28 text-right" /></div>
            <div className="flex items-center justify-between gap-2"><span>RMA discount (−)</span><Input name="rma_discount_usd" value={rma} onChange={(e) => setRma(e.target.value)} inputMode="decimal" className="h-7 w-28 text-right" /></div>
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
