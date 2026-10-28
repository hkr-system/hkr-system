"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createRma, type UnitInput } from "@/app/(app)/rmas/actions";
import { FAULT_CATEGORIES, LOCATION_LABEL, SOURCE_LABEL } from "@/lib/rmas/constants";
import { parseRmaForm } from "@/lib/rmas/form-import";
import { luhnValid } from "@/lib/orders/imei";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = UnitInput & { key: number };
const empty = (key: number): Row => ({ key, imei: "", fault_category: FAULT_CATEGORIES[0], fault_text: "", source: "testing", detected_on: "", battery_swollen: false, physical_damage: false });

export function NewRmaForm({ accounts, defaultAccount }: { accounts: { id: string; code: string; name: string }[]; defaultAccount?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [account, setAccount] = useState(defaultAccount ?? "");
  const [head, setHead] = useState({ location: "", orderRefs: "", contactName: "", contactInfo: "", clientNotes: "", internalNotes: "" });
  const [rows, setRows] = useState<Row[]>([empty(1)]);
  const [channel, setChannel] = useState<"internal" | "import">("internal");
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const set = (k: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  async function importForm(file: File) {
    setError(null);
    const { readSheet } = await import("read-excel-file/browser");
    let data: unknown[][];
    try {
      data = await readSheet(file, "RMA Form");
    } catch {
      data = await readSheet(file);
    }
    const p = parseRmaForm(data as never);
    setProblems(p.problems);
    if (!p.units.length) return;
    setChannel("import");
    setHead((h) => ({
      ...h, location: p.header.location ?? h.location, orderRefs: p.header.orderRefs ?? h.orderRefs,
      contactName: p.header.contact ?? h.contactName, contactInfo: p.header.contactInfo ?? h.contactInfo,
      internalNotes: [h.internalNotes, p.units.some((u) => u.evidence_names) ? `Evidence named on the form: ${p.units.map((u) => u.evidence_names).filter(Boolean).join(", ")}` : ""].filter(Boolean).join("\n"),
    }));
    setRows(p.units.map((u, i) => ({ key: i + 1, imei: u.imei, model: u.model, storage_gb: u.storage_gb, color: u.color, fault_category: u.fault_category,
      fault_text: u.fault_text, source: u.source, detected_on: u.detected_on ?? "", battery_swollen: u.battery_swollen, physical_damage: u.physical_damage })));
  }

  const submit = () => start(async () => {
    setError(null);
    if (!account) { setError("Choose the account."); return; }
    const r = await createRma({
      accountId: account, channel, location: head.location || null, orderRefs: head.orderRefs || null, contactName: head.contactName || null,
      contactInfo: head.contactInfo || null, clientNotes: head.clientNotes || null, internalNotes: head.internalNotes || null,
      units: rows.map((r) => ({ imei: r.imei, model: r.model, storage_gb: r.storage_gb, color: r.color, fault_category: r.fault_category,
        fault_text: r.fault_text, source: r.source, detected_on: r.detected_on, battery_swollen: r.battery_swollen, physical_damage: r.physical_damage })),
    });
    if (r.error) setError(r.error); else router.push(`/rmas/${r.id}`);
  });

  return (
    <div className="grid gap-4" data-testid="new-rma">
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
        <div className="grid gap-1.5 sm:col-span-2"><Label>Account</Label>
          <NativeSelect value={account} onChange={(e) => setAccount(e.target.value)} data-testid="rma-account">
            <option value="">Choose…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>Import the client&apos;s RMA Request Form (xlsx)</Label>
          <Input type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importForm(f); }} data-testid="rma-import" />
        </div>
        {problems.length ? (
          <ul className="grid gap-0.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900 sm:col-span-3" data-testid="import-problems">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}
        <div className="grid gap-1.5"><Label>Where are the units now?</Label>
          <NativeSelect value={head.location} onChange={(e) => setHead({ ...head, location: e.target.value })}>
            <option value="">—</option>
            {Object.entries(LOCATION_LABEL.en).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>Order / invoice number(s)</Label><Input value={head.orderRefs} onChange={(e) => setHead({ ...head, orderRefs: e.target.value })} /></div>
        <div className="grid gap-1.5"><Label>Contact person</Label><Input value={head.contactName} onChange={(e) => setHead({ ...head, contactName: e.target.value })} /></div>
        <div className="grid gap-1.5"><Label>Email / WhatsApp</Label><Input value={head.contactInfo} onChange={(e) => setHead({ ...head, contactInfo: e.target.value })} /></div>
        <div className="grid gap-1.5 sm:col-span-2"><Label>What the client asks</Label><Input value={head.clientNotes} onChange={(e) => setHead({ ...head, clientNotes: e.target.value })} /></div>
        <div className="grid gap-1.5 sm:col-span-3"><Label>Internal notes</Label><Textarea rows={2} value={head.internalNotes} onChange={(e) => setHead({ ...head, internalNotes: e.target.value })} /></div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Units — one line per IMEI (the IMEI check runs when you save)</p>
        {rows.map((r, i) => (
          <div key={r.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[2fr_2fr_3fr_1.4fr_1.2fr_auto_auto_auto]" data-testid="new-unit">
            <div className="grid gap-1"><Label className="text-xs">IMEI #{i + 1}</Label>
              <Input value={r.imei} inputMode="numeric" className="font-mono" onChange={(e) => set(r.key, { imei: e.target.value.replace(/\D/g, "").slice(0, 15) })} />
              {r.imei.length === 15 && !luhnValid(r.imei) ? <span className="text-xs text-hkr-action">check digit fails</span> : null}
            </div>
            <div className="grid gap-1"><Label className="text-xs">Fault category</Label>
              <NativeSelect value={r.fault_category} onChange={(e) => set(r.key, { fault_category: e.target.value })}>{FAULT_CATEGORIES.map((f) => <option key={f}>{f}</option>)}</NativeSelect>
            </div>
            <div className="grid gap-1"><Label className="text-xs">Description</Label><Input value={r.fault_text ?? ""} onChange={(e) => set(r.key, { fault_text: e.target.value })} /></div>
            <div className="grid gap-1"><Label className="text-xs">Source</Label>
              <NativeSelect value={r.source} onChange={(e) => set(r.key, { source: e.target.value as Row["source"] })}>
                {Object.entries(SOURCE_LABEL.en).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </NativeSelect>
            </div>
            <div className="grid gap-1"><Label className="text-xs">Detected</Label><Input type="date" value={r.detected_on ?? ""} onChange={(e) => set(r.key, { detected_on: e.target.value })} /></div>
            <label className="flex items-center gap-1 self-end pb-1.5 text-xs"><input type="checkbox" checked={Boolean(r.battery_swollen)} onChange={(e) => set(r.key, { battery_swollen: e.target.checked })} /> Swollen</label>
            <label className="flex items-center gap-1 self-end pb-1.5 text-xs"><input type="checkbox" checked={Boolean(r.physical_damage)} onChange={(e) => set(r.key, { physical_damage: e.target.checked })} /> Damage</label>
            <Button size="icon-sm" variant="ghost" className="self-end" aria-label="Remove line" onClick={() => setRows((rs) => rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs)}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
        <div><Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, empty(Math.max(...rs.map((x) => x.key)) + 1)])}><Plus className="size-3.5" /> Add a unit</Button></div>
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={pending} onClick={submit} data-testid="create-rma">{pending ? "Saving…" : "Create RMA"}</Button>
        {error ? <span className="text-sm text-destructive" role="alert">{error}</span> : null}
        <span className="text-xs text-muted-foreground">It opens as “Form received”. Attach the evidence on each unit next.</span>
      </div>
    </div>
  );
}
