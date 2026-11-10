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

export type IntermediaryRow = Required<Omit<IntermediaryInput, "id">> & { id: string; orders: number; clients: number; batches: number };
type Row = IntermediaryRow & { key: string };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const blank = (): Row => ({
  key: `new-${Date.now()}`, id: "", name: "", kind: "intermediary", rsin: null, eori: null, kvk: null, vat: null,
  contact: null, contact_phone: null, contact_email: null, address: null, country: null, default_cutoff_weekday: null,
  orders: 0, clients: 0, batches: 0,
});
const FIELDS = ["name", "kind", "rsin", "eori", "kvk", "vat", "contact", "contact_phone", "contact_email", "address", "country", "default_cutoff_weekday"] as const;

// Settings → Intermediaries & clearance companies (Gabriel, Nov 9 2026), laid out like the client's saved addresses: one
// card per company. These are the companies HKR invoices instead of the client (Ultimate consignee on the invoice); they
// pay HKR in USD. Identifiers RSIN / EORI / KVK/CoC / VAT are separate; empty ones are not printed. One Save.
export function IntermediariesEditor({ rows: initial }: { rows: IntermediaryRow[] }) {
  const router = useRouter();
  const start0 = (): Row[] => initial.map((r) => ({ ...r, key: r.id }));
  const [rows, setRows] = useState<Row[]>(start0);
  const sig = initial.map((r) => FIELDS.map((f) => String(r[f])).join(":") + r.id).join("|");
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
        .map((r) => ({ id: r.key.startsWith("new-") ? undefined : r.id, ...Object.fromEntries(FIELDS.map((f) => [f, r[f]])) }) as IntermediaryInput));
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              {r.key.startsWith("new-") ? <span>New — saved with “Save companies”.</span> : (
                <span>Used by {r.orders} order{r.orders === 1 ? "" : "s"} · last route of {r.clients} client{r.clients === 1 ? "" : "s"}{r.batches ? ` · ${r.batches} RMA batch${r.batches === 1 ? "" : "es"}` : ""}</span>
              )}
              {used === 0 ? <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive" disabled={pending} onClick={() => remove(r)}>Remove</Button> : null}
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
