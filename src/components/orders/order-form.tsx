"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { saveOrder, type ActionState } from "@/app/(app)/orders/actions";
import { orderTotals, shippingTotal } from "@/lib/orders/calc";
import { ChargesEditor, chargesTotal, type Charge } from "./order-charges";
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
import Link from "next/link";

export type FormAccount = {
  id: string; code: string; name: string; payment_method: PaymentMethod; delivery_setup: DeliverySetup;
  has_intermediary: boolean; battery_line_separate: boolean; country: string | null; legal_name: string | null; orders: number;
  ce_default?: boolean;   // invoice format "show CE text" → CE Marks ticked on new lines
  ship_default?: Record<string, string>;   // last order's ship-to, else the account's own address
  invoice_format?: { battery_line_separate: boolean; show_ce_text: boolean; plain_lines: boolean; show_note: boolean }; // the client's last order
  intermediary_id?: string | null;   // route of the client's last order
  last_address_id?: string | null;   // saved address of the client's last order
};
export type SavedAddress = { id: string; account_id: string; label: string; kind: string; company: string | null; contact_name: string | null;
  phone: string | null; email: string | null; address: string | null; city: string | null; country: string | null; archived: boolean };
const KIND_LABEL: Record<string, string> = { client: "Client (direct)", forwarder: "Forwarder", clearance: "Clearance company", other: "Other" };
type Sku = { id: string; label: string; battery_eligible: boolean; model: string; storage_gb: number };
/** Approved list per account: "<model>|<gb>" → row (loadApprovedPrices). */
export type AccountPrices = Record<string, { version: string; validUntil: string | null; rows: Record<string, { id: string; model: string; storage_gb: number; note: string | null; price: number; floor: number | null }> }>;
export type { Line } from "./order-lines";

export type OrderValues = {
  id?: string; account_id?: string; order_date?: string; payment_method?: PaymentMethod; delivery_setup?: DeliverySetup;
  hk_invoice_no?: string | null; partner_invoice_no?: string | null; partner_invoice_eur?: number | null;
  freight_usd?: number; customs_usd?: number; rma_discount_usd?: number;
  freight_mode?: "unit" | "total"; freight_unit_usd?: number | null; customs_mode?: "unit" | "total"; customs_unit_usd?: number | null;
  charges?: Charge[]; eta_date?: string | null; notes?: string | null;
  ship_to?: Record<string, string>; lines?: Line[]; intermediary_id?: string | null; address_id?: string | null;
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

export function OrderForm({ accounts, skus, values = {}, isAdmin, terms, prices = {}, intermediaries = [], addresses = [] }: {
  accounts: FormAccount[]; skus: Sku[]; values?: OrderValues; isAdmin: boolean; prices?: AccountPrices;
  intermediaries?: { id: string; name: string; kind?: string; suggestedFor?: string[] }[]; addresses?: SavedAddress[];
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
  // the client's saved companies first (★), then the rest of the shared list (Gabriel, Nov 9 2026)
  const routeOptions = useMemo(() => intermediaries
    .map((i) => ({ ...i, saved: Boolean(accountId && i.suggestedFor?.includes(accountId)) }))
    .sort((a, b) => Number(b.saved) - Number(a.saved) || a.name.localeCompare(b.name)), [intermediaries, accountId]);
  const [saveRoute, setSaveRoute] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>(values.payment_method ?? account?.payment_method ?? "wire");
  const [setup, setSetup] = useState<DeliverySetup>(values.delivery_setup ?? account?.delivery_setup ?? "client_label");
  // Magic invoice creator → Cancel puts the lines back as they were before "Read the order" (Gabriel, Nov 9 2026)
  const beforeMagic = useRef<Line[] | null>(null);
  const [lines, setLines] = useState<Line[]>(values.lines?.length ? values.lines : [emptyLine(ceOf(values.account_id ?? ""))]);
  // shipping and customs: per unit (US$ × units) or one total for the shipment; other charges / discounts (Gabriel, Nov 4 2026)
  const [freightMode, setFreightMode] = useState<"unit" | "total">(values.freight_mode ?? "total");
  const [freightUnit, setFreightUnit] = useState(values.freight_unit_usd != null ? String(values.freight_unit_usd) : "");
  const [freight, setFreight] = useState(String(values.freight_mode === "unit" ? "" : values.freight_usd ?? 0));
  const [customsMode, setCustomsMode] = useState<"unit" | "total">(values.customs_mode ?? "total");
  const [customsUnit, setCustomsUnit] = useState(values.customs_unit_usd != null ? String(values.customs_unit_usd) : "");
  const [customs, setCustoms] = useState(String(values.customs_mode === "unit" ? "" : values.customs_usd ?? 0));
  const [charges, setCharges] = useState<Charge[]>(values.charges ?? []);
  const rma = String(values.rma_discount_usd ?? 0); // credit notes applied on the order page (Nov 3 2026), never typed
  const shipFor = (id: string) => accounts.find((a) => a.id === id)?.ship_default ?? {};
  const [ship, setShip] = useState<Record<string, string>>(
    values.ship_to && Object.values(values.ship_to).some(Boolean) ? values.ship_to : shipFor(values.account_id ?? (accounts.length === 1 ? accounts[0].id : "")));
  const setS = (k: string) => (e: { target: { value: string } }) => setShip((s) => ({ ...s, [k]: e.target.value }));
  // route (who invoices the client) and the saved address are chosen per order (Gabriel, Nov 4 2026)
  const initialAccount = values.account_id ?? (accounts.length === 1 ? accounts[0].id : "");
  const [route, setRoute] = useState<string>(values.id ? values.intermediary_id ?? "" : accounts.find((a) => a.id === initialAccount)?.intermediary_id ?? "");
  const addrOf = (id: string) => addresses.filter((x) => x.account_id === id && !x.archived);
  const lastAddr = (id: string) => { const a = accounts.find((x) => x.id === id)?.last_address_id; return a && addrOf(id).some((x) => x.id === a) ? a : ""; };
  const [addrId, setAddrId] = useState<string>(values.id ? values.address_id ?? "" : lastAddr(initialAccount));
  const [newAddr, setNewAddr] = useState({ label: "", kind: "forwarder", email: "", save: true });
  const fillFrom = (x: SavedAddress) => setShip({ name: x.company ?? "", contact: x.contact_name ?? "", phone: x.phone ?? "", email: x.email ?? "",
    address: x.address ?? "", city: x.city ?? "", country: x.country ?? "" });
  const pickAddress = (id: string) => {
    setAddrId(id);
    const x = addresses.find((a) => a.id === id);
    if (x) fillFrom(x);
    else if (id === "new") setShip({});
  };
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

  const pcs = lines.reduce((n, l) => n + (Math.round(Number(String(l.qty).replace(",", "."))) || 0), 0);
  const freightTotal = shippingTotal(freightMode, Number(freightUnit) || 0, Number(freight) || 0, pcs);
  const customsTotal = shippingTotal(customsMode, Number(customsUnit) || 0, Number(customs) || 0, pcs);
  const chargesSum = chargesTotal(charges);
  const t = orderTotals({
    lines: lines.map((l) => ({
      qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0, batteryNew: l.battery === "new",
      batteryUnit: Number(l.battery_unit) || 0, batteryEligible: batteryLineEligible(l.model),
    })),
    batteryLineSeparate: separate, freight: freightTotal, customs: customsTotal, charges: chargesSum, rmaDiscount: Number(rma) || 0,
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
    if (!values.id) {
      setRoute(a?.intermediary_id ?? "");
      const last = lastAddr(id);
      setAddrId(last);
      const x = addresses.find((y) => y.id === last);
      if (x) fillFrom(x); else setShip(shipFor(id));
    }
    const next = choicesFor(id);
    setLines((ls) => ls.map((l) => (l.model ? withChoice(l, next.find((c) => c.key === modelKey(l.model, l.storage_gb ?? 0))) : { ...l, ce: ceOf(id) })));
  };
  const list = accountId ? prices[accountId] : undefined;

  return (
    <form action={action} className="grid gap-4" data-testid="order-form">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="lines" value={JSON.stringify(lines.map(lineToPayload))} />
      <input type="hidden" name="invoice_format" value={JSON.stringify(fmt)} />
      <input type="hidden" name="address_id" value={addrId === "new" ? "" : addrId} />

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
          <F label="Route: who HKR invoices (Ultimate consignee)">
            <NativeSelect name="intermediary_id" value={route} onChange={(e) => { setRoute(e.target.value); setSaveRoute(true); }} data-testid="order-route">
              <option value="">Direct: invoice the client (pays HKR in USD)</option>
              {routeOptions.map((i) => (
                <option key={i.id} value={i.id}>{i.saved ? "★ " : ""}Via {i.name} ({i.kind === "clearance" ? "clearance company" : "intermediary"})</option>
              ))}
              {isAdmin ? <option value="new">+ New intermediary / clearance company…</option> : null}
            </NativeSelect>
            {!isAdmin ? <span className="text-xs text-muted-foreground">Not in the list? An admin adds it in Settings → Intermediaries &amp; clearance.</span> : null}
            {accountId && routeOptions.some((i) => i.saved) ? <span className="text-xs text-muted-foreground">★ = saved for this client</span> : null}
          </F>
          {route === "new" ? (
            <F label="Name of the new company">
              <Input name="new_intermediary" placeholder="e.g. Galimix Europe SL" required data-testid="new-intermediary" />
              <span className="text-xs text-muted-foreground">Added to Settings → Intermediaries &amp; clearance when you save the order; fill in its VAT, address and contact there.</span>
            </F>
          ) : null}
          {route && accountId && !routeOptions.find((i) => i.id === route)?.saved ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="save_route" checked={saveRoute} onChange={(e) => setSaveRoute(e.target.checked)} className="size-4" data-testid="save-route" />
              Save for this client (suggested first on its next orders)
            </label>
          ) : null}
          {route ? (
            <p className="text-sm text-muted-foreground sm:col-span-2 sm:self-end">Our invoice goes to this company (it is the Ultimate consignee) and it pays us in USD. Their invoice to the client, if any, is added on the order page.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
          <CardDescription>
            {account ? list ? `Unit prices come from the client's approved price list ${list.version}; a different price is marked “manual” and logged.` : "This client has no approved price list yet: type the unit prices." : "Choose the account first."}
            {account ? separate ? " This account shows a separate “New battery cell” line (iPhone 16 series never carries it)." : " This account has the battery absorbed in the unit price." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {!values.id ? (
            <MagicReader choices={choices} ceDefault={ceOf(accountId)} disabled={!accountId}
              onLines={(ls) => setLines((cur) => { beforeMagic.current ??= cur; return [...cur.filter((l) => l.model || l.description || l.qty), ...ls]; })}
              onCancel={() => { if (beforeMagic.current) setLines(beforeMagic.current); beforeMagic.current = null; }} />
          ) : null}
          {lines.map((l, i) => (
            <LineEditor key={i} line={l} i={i} choices={choices} isAdmin={isAdmin} separate={separate}
              onChange={(p) => setLine(i, p)} onRemove={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [emptyLine(ceOf(accountId))]))} />
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AddLineButton onAdd={() => setLines((ls) => [...ls, emptyLine(ceOf(accountId))])} />
            <UnitsSummary lines={lines} />
          </div>
        </CardContent>
      </Card>

      <Card data-testid="order-charges">
        <CardHeader>
          <CardTitle className="text-base">Shipping, customs and other charges</CardTitle>
          <CardDescription>Per unit (US$ × the {pcs} units of this order) or one amount for the whole shipment. Other charges print as their own line on the invoice; a negative amount is a discount.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <input type="hidden" name="freight_mode" value={freightMode} />
          <input type="hidden" name="customs_mode" value={customsMode} />
          <input type="hidden" name="freight_usd" value={freightMode === "total" ? freight : String(freightTotal)} />
          <input type="hidden" name="customs_usd" value={customsMode === "total" ? customs : String(customsTotal)} />
          <input type="hidden" name="freight_unit_usd" value={freightMode === "unit" ? freightUnit : ""} />
          <input type="hidden" name="customs_unit_usd" value={customsMode === "unit" ? customsUnit : ""} />
          <input type="hidden" name="charges" value={JSON.stringify(charges)} />
          <FeeRow label="Shipping" testId="freight" mode={freightMode} setMode={setFreightMode} unit={freightUnit} setUnit={setFreightUnit}
            total={freight} setTotal={setFreight} pcs={pcs} computed={freightTotal} />
          <FeeRow label="Customs" testId="customs" mode={customsMode} setMode={setCustomsMode} unit={customsUnit} setUnit={setCustomsUnit}
            total={customs} setTotal={setCustoms} pcs={pcs} computed={customsTotal} />
          <ChargesEditor charges={charges} onChange={setCharges} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle className="text-base">Ship to (this order)</CardTitle><CardDescription>Pick one of the client&apos;s saved addresses (direct, forwarder, clearance company…) or add a new one. Changes typed here apply to this order only.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <F label="Saved address" className="sm:col-span-2">
              <NativeSelect value={addrId} onChange={(e) => pickAddress(e.target.value)} disabled={!accountId} data-testid="order-address">
                <option value="">{addrOf(accountId).length ? "— Not from the list (this order only) —" : "— No saved addresses yet —"}</option>
                {addrOf(accountId).map((x) => <option key={x.id} value={x.id}>{x.label} · {KIND_LABEL[x.kind] ?? x.kind}{x.city || x.country ? ` · ${[x.city, x.country].filter(Boolean).join(", ")}` : ""}</option>)}
                <option value="new">+ New address…</option>
              </NativeSelect>
            </F>
            {addrId === "new" ? (
              <div className="grid gap-3 rounded-md border border-dashed p-3 sm:col-span-2 sm:grid-cols-3" data-testid="new-address">
                <F label="Name for the list *"><Input name="new_address_label" value={newAddr.label} placeholder="e.g. Miami forwarder (XYZ Cargo)" onChange={(e) => setNewAddr((n) => ({ ...n, label: e.target.value }))} /></F>
                <F label="Kind">
                  <NativeSelect name="new_address_kind" value={newAddr.kind} onChange={(e) => setNewAddr((n) => ({ ...n, kind: e.target.value }))}>
                    {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </NativeSelect>
                </F>
                <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
                  <input type="checkbox" name="new_address_save" checked={newAddr.save} onChange={(e) => setNewAddr((n) => ({ ...n, save: e.target.checked }))} className="size-4" />
                  Save to this client&apos;s addresses
                </label>
              </div>
            ) : null}
            <F label="Company / consignee"><Input name="ship_name" value={ship.name ?? ""} onChange={setS("name")} /></F>
            <F label="Reception contact name"><Input name="ship_contact" placeholder="Name of the person (the phone goes below)" value={ship.contact ?? ""} onChange={setS("contact")} /></F>
            <F label="Address" className="sm:col-span-2"><Input name="ship_address" value={ship.address ?? ""} onChange={setS("address")} /></F>
            <F label="City"><Input name="ship_city" value={ship.city ?? ""} onChange={setS("city")} /></F>
            <F label="Country">
              <NativeSelect name="ship_country" value={ship.country ?? ""} onChange={setS("country")}>
                <option value="">—</option>
                {countryOptions("en").map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </NativeSelect>
            </F>
            <F label="Phone"><Input name="ship_phone" value={ship.phone ?? ""} onChange={setS("phone")} /></F>
            <F label="Email"><Input name="ship_email" type="email" value={ship.email ?? ""} onChange={setS("email")} /></F>
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
            <div className="flex justify-between"><span>Shipping{freightMode === "unit" ? ` (${pcs} × ${money(Number(freightUnit) || 0)})` : ""}</span><span data-testid="total-freight">{money(freightTotal)}</span></div>
            <div className="flex justify-between"><span>Customs{customsMode === "unit" ? ` (${pcs} × ${money(Number(customsUnit) || 0)})` : ""}</span><span data-testid="total-customs">{money(customsTotal)}</span></div>
            {charges.length ? <div className="flex justify-between"><span>Other charges / discounts</span><span data-testid="total-charges">{money(chargesSum)}</span></div> : null}
            {Number(rma) ? <div className="flex items-center justify-between gap-2" title="Applied on the order page from approved credit notes"><span>Credit notes (−)</span><span className="tabular-nums">{Number(rma).toFixed(2)}</span></div> : null}
            {method === "usdt" ? <div className="flex justify-between"><span>USDT fee {terms.usdtFeePct} %</span><span>{money(t.usdtFee)}</span></div> : null}
            {method === "mixed" ? <p className="text-xs text-muted-foreground">Mixed: no USDT fee on the invoice — each USDT payment brings the part it covers + {terms.usdtFeePct} %.</p> : null}
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
        <Button type="submit" disabled={pending || problems.length > 0 || t.total < 0}>{pending ? "Saving…" : values.id ? "Save order" : "Create order"}</Button>
        {/* leave without saving (Gabriel, Nov 3 2026) */}
        <Button asChild type="button" variant="outline" data-testid="order-cancel">
          <Link href={values.id ? `/orders/${values.id}` : "/orders"}>Cancel</Link>
        </Button>
        {problems.length ? <p className="text-sm text-destructive" role="alert" data-testid="lines-problem">Fix the colours first: {problems[0]}</p> : null}
        {t.total < 0 ? <p className="text-sm text-destructive" role="alert">The discounts are larger than the order.</p> : null}
        {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      </div>
    </form>
  );
}

/** "47 units · 3 lines" under the lines, with the units per model (Gabriel, Nov 4 2026). */
function UnitsSummary({ lines }: { lines: Line[] }) {
  const byModel = new Map<string, number>();
  let total = 0;
  for (const l of lines) {
    const q = Math.round(Number(String(l.qty).replace(",", "."))) || 0;
    if (!q) continue;
    total += q;
    const name = l.model ? `${l.model}${l.storage_gb ? ` ${l.storage_gb}GB` : ""}` : l.description || "Other";
    byModel.set(name, (byModel.get(name) ?? 0) + q);
  }
  return (
    <div className="text-right text-sm" data-testid="units-summary">
      <span className="font-semibold">Total: {total} unit{total === 1 ? "" : "s"}</span>
      <span className="text-muted-foreground"> · {lines.length} line{lines.length === 1 ? "" : "s"}</span>
      {byModel.size > 1 ? <span className="block text-xs text-muted-foreground">{[...byModel].map(([m, q]) => `${m}: ${q}`).join(" · ")}</span> : null}
    </div>
  );
}

/** Shipping / customs: per unit (US$ × units) or one total for the shipment. */
function FeeRow({ label, testId, mode, setMode, unit, setUnit, total, setTotal, pcs, computed }: {
  label: string; testId: string; mode: "unit" | "total"; setMode: (m: "unit" | "total") => void; unit: string; setUnit: (v: string) => void;
  total: string; setTotal: (v: string) => void; pcs: number; computed: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[110px_1fr_auto] sm:items-center" data-testid={`fee-${testId}`}>
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "unit"} onChange={() => setMode("unit")} className="size-4" data-testid={`${testId}-mode-unit`} /> Per unit</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "total"} onChange={() => setMode("total")} className="size-4" data-testid={`${testId}-mode-total`} /> Total for the shipment</label>
        {mode === "unit" ? (
          <span className="flex items-center gap-1.5">US$
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} inputMode="decimal" className="h-8 w-24 text-right" aria-label={`${label} US$ per unit`} data-testid={`${testId}-unit`} />
            <span className="text-muted-foreground">per unit × {pcs}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">US$
            <Input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" className="h-8 w-28 text-right" aria-label={`${label} total US$`} data-testid={`${testId}-total`} />
          </span>
        )}
      </div>
      <span className="text-right text-sm font-medium" data-tabular>{money(computed)}</span>
    </div>
  );
}
