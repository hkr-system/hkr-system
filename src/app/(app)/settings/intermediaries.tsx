"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { countryOptions } from "@/lib/leads/countries";
import { deleteIntermediary, saveIntermediaries, type IntermediaryInput } from "./actions";
import { EMPTY_D2D, type D2DConfig } from "@/lib/price-lists/door-to-door";

export type IntermediaryRow = Required<Omit<IntermediaryInput, "id">> & { id: string; orders: number; clients: number; batches: number };
type Row = IntermediaryRow & { key: string };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const blank = (): Row => ({
  key: `new-${Date.now()}`, id: "", name: "", kind: "intermediary", rsin: null, eori: null, kvk: null, vat: null,
  contact: null, contact_phone: null, contact_email: null, address: null, country: null, default_cutoff_weekday: null, d2d: null,
  orders: 0, clients: 0, batches: 0,
});
const FIELDS = ["name", "kind", "rsin", "eori", "kvk", "vat", "contact", "contact_phone", "contact_email", "address", "country", "default_cutoff_weekday", "d2d"] as const;

// Settings → Intermediaries & clearance companies (Gabriel, Nov 9 2026), laid out like the client's saved addresses: one
// card per company. These are the companies HKR invoices instead of the client (Ultimate consignee on the invoice); they
// pay HKR in USD. Identifiers RSIN / EORI / KVK/CoC / VAT are separate; empty ones are not printed. One Save.
export function IntermediariesEditor({ rows: initial, canDelete = true, canD2D = canDelete }: { rows: IntermediaryRow[]; canDelete?: boolean; canD2D?: boolean }) {
  const router = useRouter();
  const start0 = (): Row[] => initial.map((r) => ({ ...r, key: r.id }));
  const [rows, setRows] = useState<Row[]>(start0);
  const sig = initial.map((r) => FIELDS.map((f) => (f === "d2d" ? JSON.stringify(r.d2d) : String(r[f]))).join(":") + r.id).join("|");
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) { setSeen(sig); setRows((cur) => [...start0(), ...cur.filter((r) => r.key.startsWith("new-") && r.name === "")]); }
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const countries = countryOptions("en");
  const set = (key: string, patch: Partial<Row>) => setRows((x) => x.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveIntermediaries(rows.filter((r) => !(r.key.startsWith("new-") && !r.name.trim()))
        .map((r) => ({ id: r.key.startsWith("new-") ? undefined : r.id, ...Object.fromEntries(FIELDS.filter((f) => f !== "d2d" || canD2D).map((f) => [f, r[f]])) }) as IntermediaryInput));
      setMsg(res.error ? { text: res.error } : { ok: true, text: res.message ?? "Saved." });
      if (!res.error) setRows((x) => x.filter((r) => !r.key.startsWith("new-")));
      router.refresh();
    });
  };
  const remove = (r: Row) => {
    if (r.key.startsWith("new-")) { setRows((x) => x.filter((y) => y.key !== r.key)); return; }
    if (!confirm(`Remove ${r.name}?`)) return;
    start(async () => {
      const res = await deleteIntermediary(r.id);
      setMsg(res.error ? { text: res.error } : { ok: true, text: `${r.name} removed.` });
      router.refresh();
    });
  };

  const text = (r: Row, f: keyof Row, label: string, extra: React.ComponentProps<typeof Input> = {}, cls = "") => (
    <label className={`grid gap-1 text-xs text-muted-foreground ${cls}`}>{label}
      <Input value={String(r[f] ?? "")} onChange={(e) => set(r.key, { [f]: e.target.value } as Partial<Row>)} className="text-foreground" aria-label={label} {...extra} />
    </label>
  );

  return (
    <form onSubmit={save} className="grid gap-3" data-testid="intermediaries">
      {rows.length ? rows.map((r) => {
        const used = r.orders + r.clients + r.batches;
        return (
          <div key={r.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="intermediary-row">
            {text(r, "name", "Company name *", { placeholder: "e.g. Galimix Europe SL", maxLength: 80 }, "sm:col-span-2")}
            <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">Type
              <NativeSelect value={r.kind} onChange={(e) => set(r.key, { kind: e.target.value === "clearance" ? "clearance" : "intermediary" })} aria-label="Type">
                <option value="intermediary">Intermediary (invoices the client)</option>
                <option value="clearance">Clearance company</option>
              </NativeSelect>
            </label>
            {text(r, "vat", "VAT", { maxLength: 40 })}
            {text(r, "eori", "EORI", { maxLength: 40 })}
            {text(r, "kvk", "KVK / CoC", { maxLength: 40 })}
            {text(r, "rsin", "RSIN", { maxLength: 40 })}
            <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">Address
              <Textarea value={r.address ?? ""} onChange={(e) => set(r.key, { address: e.target.value })} rows={3} maxLength={400}
                placeholder={"One line each: street and number, postcode and city, region"} className="text-foreground" aria-label="Address" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">Country
              <NativeSelect value={r.country ?? ""} onChange={(e) => set(r.key, { country: e.target.value || null })} aria-label="Country">
                <option value="">—</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">RMA batch cut-off day
              <NativeSelect value={String(r.default_cutoff_weekday ?? "")} aria-label="RMA batch cut-off day"
                onChange={(e) => set(r.key, { default_cutoff_weekday: e.target.value ? Number(e.target.value) : null })}>
                <option value="">No RMA batches</option>
                {DAYS.map((d, i) => <option key={d} value={String(i + 1)}>{d}</option>)}
              </NativeSelect>
            </label>
            {text(r, "contact", "Contact name", { maxLength: 120 })}
            {text(r, "contact_email", "Contact email", { type: "email", maxLength: 160 })}
            {text(r, "contact_phone", "Contact phone", { type: "tel", inputMode: "tel", maxLength: 40 })}
            <div />
            {canD2D ? <D2DEditor value={r.d2d} onChange={(d2d) => set(r.key, { d2d })} name={r.name} /> : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              {r.key.startsWith("new-") ? <span>New — saved with “Save companies”.</span> : (
                <span>Used by {r.orders} order{r.orders === 1 ? "" : "s"} · last route of {r.clients} client{r.clients === 1 ? "" : "s"}{r.batches ? ` · ${r.batches} RMA batch${r.batches === 1 ? "" : "es"}` : ""}</span>
              )}
              {used === 0 && (canDelete || r.key.startsWith("new-")) ? <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive" disabled={pending} onClick={() => remove(r)}>Remove</Button> : null}
            </div>
          </div>
        );
      }) : <p className="text-sm text-muted-foreground">No companies yet.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" data-testid="add-intermediary" onClick={() => setRows((x) => [...x, blank()])}>
          <Plus className="size-4" /> Add company
        </Button>
        <Button type="submit" size="sm" disabled={pending} data-testid="save-intermediaries">{pending ? "Saving…" : "Save companies"}</Button>
      </div>
      {msg ? <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{msg.text}</p> : null}
    </form>
  );
}

// Door-to-door pricing set-up of one company (admin, Nov 18 2026): what it adds to our USD price to deliver in the EU.
function D2DEditor({ value, onChange, name }: { value: D2DConfig | null; onChange: (v: D2DConfig | null) => void; name: string }) {
  const v = value ?? EMPTY_D2D;
  const put = (p: Partial<D2DConfig>) => onChange({ ...v, ...p });
  const n = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(",", ".")));
  const field = (label: string, val: number | null, on: (s: string) => void, w = "w-24") => (
    <label className="grid gap-1 text-xs text-muted-foreground">{label}
      {/* uncontrolled: typing "0." or "3," keeps the dot while the number is stored */}
      <Input defaultValue={val === null ? "" : String(val)} onChange={(e) => on(e.target.value)} inputMode="decimal" className={`h-8 text-right text-foreground ${w}`} aria-label={`${label} (${name})`} />
    </label>
  );
  return (
    <details className="rounded-md border bg-muted/30 p-2 sm:col-span-2 lg:col-span-4" open={v.enabled} data-testid="d2d-editor">
      <summary className="cursor-pointer text-sm font-medium">Door-to-door pricing (EU clients){v.enabled ? " · on" : ""}</summary>
      <div className="mt-2 grid gap-3 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.enabled} onChange={(e) => put({ enabled: e.target.checked })} className="size-4" aria-label={`Door to door on (${name})`} />
          Offer door-to-door EUR price lists via this company (its name is never printed)</label>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Fee per unit by price in EUR (limits included; leave the last “up to” empty for “and above”)</span>
          {v.brackets.map((b, i) => (
            <div key={`${i}-${v.brackets.length}`} className="flex flex-wrap items-end gap-2" data-testid="d2d-bracket">
              {field("Up to €", b.up_to, (s) => put({ brackets: v.brackets.map((x, j) => (j === i ? { ...x, up_to: s.trim() === "" ? null : n(s) } : x)) }))}
              {field("Fee € per unit", b.eur, (s) => put({ brackets: v.brackets.map((x, j) => (j === i ? { ...x, eur: n(s) } : x)) }))}
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => put({ brackets: v.brackets.filter((_, j) => j !== i) })}>Remove</Button>
            </div>
          ))}
          <div><Button type="button" size="sm" variant="outline" className="h-7" data-testid="d2d-add-bracket" onClick={() => put({ brackets: [...v.brackets, { up_to: null, eur: 0 }] })}><Plus className="size-3.5" /> Add bracket</Button></div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {field("Fixed fee € per unit", v.fixed_eur, (s) => put({ fixed_eur: n(s) }))}
          {field("Shipping per unit", v.ship_amount, (s) => put({ ship_amount: n(s) }))}
          <label className="grid gap-1 text-xs text-muted-foreground">Shipping currency
            <NativeSelect value={v.ship_currency} onChange={(e) => put({ ship_currency: e.target.value === "USD" ? "USD" : "EUR" })} aria-label={`Shipping currency (${name})`} className="w-28">
              <option value="EUR">EUR</option><option value="USD">USD</option>
            </NativeSelect>
          </label>
          {field("Fee € per shipment", v.shipment_eur, (s) => put({ shipment_eur: n(s) }))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {field("Small order: under (pcs)", v.small_under, (s) => put({ small_under: s.trim() === "" ? null : Math.round(n(s)) }))}
          {field("… + € per unit", v.small_eur, (s) => put({ small_eur: n(s) }))}
          {field("Rate spread (e.g. 0.01)", v.fx_spread, (s) => put({ fx_spread: n(s) }), "w-28")}
        </div>
        <p className="text-xs text-muted-foreground">Price per unit = our USD price (+ shipping if in USD) ÷ rate, then + fee of its bracket + fixed fee + shipping if in EUR.
          Rate = official EUR→USD of the day − spread (editable when you produce the list). Small-order and per-shipment fees print as notes.</p>
      </div>
    </details>
  );
}
