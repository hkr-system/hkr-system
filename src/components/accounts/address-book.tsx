"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { EditLock } from "@/components/edit-lock";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { countryOptions } from "@/lib/leads/countries";
import { saveAddresses } from "@/app/(app)/accounts/actions";
import type { SavedAddress } from "@/components/orders/order-form";

const KIND: [string, string][] = [["client", "Client (direct)"], ["forwarder", "Forwarder"], ["clearance", "Clearance company"], ["other", "Other"]];
type Row = Omit<SavedAddress, "account_id"> & { key: string; notes?: string | null };
const FIELDS: [keyof Row, string, string][] = [
  ["company", "Company / consignee", ""], ["contact_name", "Contact name", ""], ["phone", "Phone", ""], ["email", "Email", ""],
  ["address", "Address", "sm:col-span-2"], ["city", "City", ""],
];

// Saved shipping addresses of a client, "like the address list in Amazon" (Gabriel, Nov 4 2026). Each order picks one.
export function AddressBook({ accountId, addresses }: { accountId: string; addresses: SavedAddress[] }) {
  const router = useRouter();
  const start0 = (): Row[] => addresses.map((a) => ({ ...a, key: a.id }));
  const [rows, setRows] = useState<Row[]>(start0);
  const sig = addresses.map((a) => `${a.id}:${a.label}:${a.archived}:${a.address}:${a.phone}`).join("|");
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) { setSeen(sig); setRows(start0()); }
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const countries = countryOptions("en");
  const set = (key: string, patch: Partial<Row>) => setRows((x) => x.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveAddresses(accountId, rows.map(({ key, ...r }) => ({ ...r, id: key.startsWith("new-") ? undefined : r.id })));
      setMsg(res.error ? { text: res.error } : { ok: true, text: res.message ?? "Saved." });
      router.refresh();
    });
  };

  return (
    <EditLock label="Edit addresses" testId="lock-addresses">
      <form onSubmit={save} className="grid gap-3">
        {rows.length ? rows.map((r) => (
          <div key={r.key} className={`grid gap-2 rounded-lg border p-3 sm:grid-cols-4 ${r.archived ? "opacity-60" : ""}`} data-testid="address-row">
            <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">Name for the list *
              <Input value={r.label} onChange={(e) => set(r.key, { label: e.target.value })} placeholder="e.g. Miami forwarder (XYZ Cargo)" className="text-foreground" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">Kind
              <NativeSelect value={r.kind} onChange={(e) => set(r.key, { kind: e.target.value })}>
                {KIND.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </NativeSelect>
            </label>
            <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
              <input type="checkbox" checked={r.archived} onChange={(e) => set(r.key, { archived: e.target.checked })} className="size-4" /> Not used any more
            </label>
            {FIELDS.map(([f, l, cls]) => (
              <label key={f} className={`grid gap-1 text-xs text-muted-foreground ${cls}`}>{l}
                <Input value={String(r[f] ?? "")} onChange={(e) => set(r.key, { [f]: e.target.value } as Partial<Row>)} className="text-foreground" />
              </label>
            ))}
            <label className="grid gap-1 text-xs text-muted-foreground">Country
              <NativeSelect value={r.country ?? ""} onChange={(e) => set(r.key, { country: e.target.value })}>
                <option value="">—</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </NativeSelect>
            </label>
          </div>
        )) : <p className="text-sm text-muted-foreground">No saved addresses yet. Add one here or with “+ New address…” on an order.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" data-testid="add-address"
            onClick={() => setRows((x) => [...x, { key: `new-${Date.now()}`, id: "", label: "", kind: "forwarder", company: null, contact_name: null, phone: null, email: null, address: null, city: null, country: null, archived: false }])}>
            <Plus className="size-4" /> Add address
          </Button>
          <Button type="submit" size="sm" disabled={pending} data-testid="save-addresses">{pending ? "Saving…" : "Save addresses"}</Button>
        </div>
        {msg ? <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{msg.text}</p> : null}
      </form>
    </EditLock>
  );
}
