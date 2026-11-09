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
  key: `new-${Date.now()}`, id: "", name: "", vat_eori: null, contact: null, contact_phone: null, contact_email: null,
  address: null, country: null, default_cutoff_weekday: null, orders: 0, clients: 0, batches: 0,
});

// Settings → Intermediaries (Gabriel, Nov 9 2026), laid out like the client's saved addresses: one card per company
// with company name, VAT / EORI, contact name, contact phone, email and address; "+ Add intermediary"; one Save.
// The order form's Route picks from this list. A company nothing uses can be removed.
export function IntermediariesEditor({ rows: initial }: { rows: IntermediaryRow[] }) {
  const router = useRouter();
  const start0 = (): Row[] => initial.map((r) => ({ ...r, key: r.id }));
  const [rows, setRows] = useState<Row[]>(start0);
  const sig = initial.map((r) => `${r.id}:${r.name}:${r.vat_eori}:${r.contact}:${r.contact_phone}:${r.contact_email}:${r.address}:${r.country}:${r.default_cutoff_weekday}`).join("|");
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) { setSeen(sig); setRows(start0()); }
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const countries = countryOptions("en");
  const set = (key: string, patch: Partial<Row>) => setRows((x) => x.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveIntermediaries(rows.map((r) => ({ id: r.key.startsWith("new-") ? undefined : r.id, name: r.name, vat_eori: r.vat_eori, contact: r.contact, contact_phone: r.contact_phone, contact_email: r.contact_email, address: r.address, country: r.country, default_cutoff_weekday: r.default_cutoff_weekday })));
      setMsg(res.error ? { text: res.error } : { ok: true, text: res.message ?? "Saved." });
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
          <div key={r.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="intermediary-row">
            {text(r, "name", "Company name *", { placeholder: "e.g. Galimix", maxLength: 80 })}
            {text(r, "vat_eori", "VAT / EORI", { maxLength: 120 })}
            {text(r, "contact", "Contact name", { maxLength: 120 })}
            {text(r, "contact_phone", "Contact phone", { type: "tel", inputMode: "tel", maxLength: 40 })}
            {text(r, "contact_email", "Email", { type: "email", maxLength: 160 })}
            <label className="grid gap-1 text-xs text-muted-foreground">Country
              <NativeSelect value={r.country ?? ""} onChange={(e) => set(r.key, { country: e.target.value || null })} aria-label="Country">
                <option value="">—</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">Address
              <Textarea value={r.address ?? ""} onChange={(e) => set(r.key, { address: e.target.value })} rows={2} maxLength={400}
                placeholder="Street, number, postcode, city" className="text-foreground" aria-label="Address" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">RMA batch cut-off day
              <NativeSelect value={String(r.default_cutoff_weekday ?? "")} aria-label="RMA batch cut-off day"
                onChange={(e) => set(r.key, { default_cutoff_weekday: e.target.value ? Number(e.target.value) : null })}>
                <option value="">No RMA batches</option>
                {DAYS.map((d, i) => <option key={d} value={String(i + 1)}>{d}</option>)}
              </NativeSelect>
            </label>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              {r.key.startsWith("new-") ? <span>New — saved with “Save intermediaries”.</span> : (
                <span>Used by {r.orders} order{r.orders === 1 ? "" : "s"} · last route of {r.clients} client{r.clients === 1 ? "" : "s"}{r.batches ? ` · ${r.batches} RMA batch${r.batches === 1 ? "" : "es"}` : ""}</span>
              )}
              {used === 0 ? <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive" disabled={pending} onClick={() => remove(r)}>Remove</Button> : null}
            </div>
          </div>
        );
      }) : <p className="text-sm text-muted-foreground">No intermediaries yet.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" data-testid="add-intermediary" onClick={() => setRows((x) => [...x, blank()])}>
          <Plus className="size-4" /> Add intermediary
        </Button>
        <Button type="submit" size="sm" disabled={pending} data-testid="save-intermediaries">{pending ? "Saving…" : "Save intermediaries"}</Button>
      </div>
      {msg ? <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{msg.text}</p> : null}
    </form>
  );
}
