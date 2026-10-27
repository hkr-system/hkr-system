"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveOrder, type ActionState } from "@/app/(app)/orders/actions";
import { orderTotals } from "@/lib/orders/calc";
import { DELIVERY_SETUP_LABEL, PAYMENT_METHOD_LABEL, money, type DeliverySetup, type PaymentMethod } from "@/lib/orders/constants";
import { countryOptions } from "@/lib/leads/countries";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type FormAccount = {
  id: string; code: string; name: string; payment_method: PaymentMethod; delivery_setup: DeliverySetup;
  has_intermediary: boolean; battery_line_separate: boolean; country: string | null; legal_name: string | null; orders: number;
};
type Sku = { id: string; label: string; battery_eligible: boolean };
type Line = { sku_id: string; description: string; qty: string; unit_price: string; battery_new: boolean; battery_unit: string; base_price: string };

export type OrderValues = {
  id?: string; account_id?: string; order_date?: string; payment_method?: PaymentMethod; delivery_setup?: DeliverySetup;
  hk_invoice_no?: string | null; partner_invoice_no?: string | null; partner_invoice_eur?: number | null;
  freight_usd?: number; customs_usd?: number; rma_discount_usd?: number; eta_date?: string | null; notes?: string | null;
  ship_to?: Record<string, string>; lines?: Line[];
};

const emptyLine = (): Line => ({ sku_id: "", description: "", qty: "", unit_price: "", battery_new: true, battery_unit: "", base_price: "" });

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`grid gap-1.5 ${className ?? ""}`}><Label>{label}</Label>{children}</div>;
}

export function OrderForm({ accounts, skus, values = {}, isAdmin, terms }: {
  accounts: FormAccount[]; skus: Sku[]; values?: OrderValues; isAdmin: boolean;
  terms: { depositPct: number; usdtFeePct: number; moqUsd: number; sampleMinUsd: number };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveOrder, {});
  const [accountId, setAccountId] = useState(values.account_id ?? (accounts.length === 1 ? accounts[0].id : ""));
  const account = accounts.find((a) => a.id === accountId);
  const [method, setMethod] = useState<PaymentMethod>(values.payment_method ?? account?.payment_method ?? "wire");
  const [setup, setSetup] = useState<DeliverySetup>(values.delivery_setup ?? account?.delivery_setup ?? "client_label");
  const [lines, setLines] = useState<Line[]>(values.lines?.length ? values.lines : [emptyLine()]);
  const [freight, setFreight] = useState(String(values.freight_usd ?? 0));
  const [customs, setCustoms] = useState(String(values.customs_usd ?? 0));
  const [rma, setRma] = useState(String(values.rma_discount_usd ?? 0));
  const ship = values.ship_to ?? {};
  const skuById = useMemo(() => new Map(skus.map((s) => [s.id, s])), [skus]);
  const separate = account?.battery_line_separate ?? true;
  const cols = isAdmin ? "sm:grid-cols-[2fr_70px_110px_1fr_110px_110px_32px]" : "sm:grid-cols-[2fr_70px_110px_1fr_110px_32px]";

  const t = orderTotals({
    lines: lines.map((l) => ({
      qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0, batteryNew: l.battery_new,
      batteryUnit: Number(l.battery_unit) || 0, batteryEligible: l.sku_id ? skuById.get(l.sku_id)?.battery_eligible ?? true : true,
    })),
    batteryLineSeparate: separate, freight: Number(freight) || 0, customs: Number(customs) || 0, rmaDiscount: Number(rma) || 0,
    paymentMethod: method, depositPct: terms.depositPct, usdtFeePct: terms.usdtFeePct,
  });
  const firstOrder = account ? account.orders === 0 && !values.id : false;
  const minimum = firstOrder ? terms.sampleMinUsd : terms.moqUsd;

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickAccount = (id: string) => {
    setAccountId(id);
    const a = accounts.find((x) => x.id === id);
    if (a) { setMethod(a.payment_method); setSetup(a.delivery_setup); }
  };

  return (
    <form action={action} className="grid gap-4" data-testid="order-form">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

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
          <F label="Our invoice no. (INV-HK)"><Input name="hk_invoice_no" defaultValue={values.hk_invoice_no ?? ""} placeholder="MMDDYYYY-1" /></F>
          {account?.has_intermediary ? (
            <>
              <F label="Intermediary invoice no. (INV-EU)"><Input name="partner_invoice_no" defaultValue={values.partner_invoice_no ?? ""} /></F>
              <F label="Intermediary invoice (EUR)"><Input name="partner_invoice_eur" inputMode="decimal" defaultValue={values.partner_invoice_eur ?? ""} placeholder="The client pays this in EUR" /></F>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
          <CardDescription>
            Unit prices are typed by hand in this phase (Phase 6 fills them from the client&apos;s list).
            {account ? separate ? " This account shows a separate “New battery cell” line (iPhone 16 series never carries it)." : " This account has the battery absorbed in the unit price." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className={`hidden gap-2 text-xs text-muted-foreground sm:grid ${cols}`}>
            <span>Model / description</span><span>Qty</span><span>Unit US$</span><span>New battery</span><span className="text-right">Line US$</span>{isAdmin ? <span>Base US$ (admin)</span> : null}<span />
          </div>
          {lines.map((l, i) => {
            const eligible = l.sku_id ? skuById.get(l.sku_id)?.battery_eligible ?? true : true;
            return (
              <div key={i} className={`grid gap-2 sm:items-center ${cols}`} data-testid="order-line">
                <div className="grid gap-1">
                  <NativeSelect value={l.sku_id} onChange={(e) => setLine(i, { sku_id: e.target.value })} aria-label="SKU">
                    <option value="">Free text…</option>
                    {skus.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </NativeSelect>
                  {!l.sku_id ? <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description" aria-label="Description" /> : null}
                </div>
                <Input value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputMode="numeric" aria-label="Quantity" />
                <Input value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} inputMode="decimal" aria-label="Unit price" />
                <div className="flex items-center gap-2 text-xs">
                  {eligible ? (
                    <>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={l.battery_new} onChange={(e) => setLine(i, { battery_new: e.target.checked })} /> 0 cycle</label>
                      {separate && l.battery_new ? <Input value={l.battery_unit} onChange={(e) => setLine(i, { battery_unit: e.target.value })} inputMode="decimal" placeholder="US$/unit" className="w-20" aria-label="Battery US$ per unit" /> : null}
                    </>
                  ) : <span className="text-muted-foreground">No battery line (iPhone 16)</span>}
                </div>
                <span className="text-right text-sm" data-tabular>{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</span>
                {isAdmin ? <Input value={l.base_price} onChange={(e) => setLine(i, { base_price: e.target.value })} inputMode="decimal" placeholder="optional" aria-label="Base price" /> : null}
                <Button type="button" size="icon" variant="ghost" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [emptyLine()]))} aria-label="Remove line">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          <div><Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus className="size-3.5" /> Add line</Button></div>
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
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : values.id ? "Save order" : "Create order"}</Button>
        {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      </div>
    </form>
  );
}
