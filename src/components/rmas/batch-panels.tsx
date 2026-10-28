"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET, MAX_FILE_BYTES } from "@/lib/files";
import {
  addToBatch, markBatchReceived, markBatchShipped, removeFromBatch, saveBatchLabel, saveBatchShipment, startBatch, type ActionState,
} from "@/app/(app)/rmas/batches/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EligibleUnit = { id: string; imei: string; rma: string; rmaId: string; client: string; model: string | null; fault: string };

export function StartBatch({ intermediaryId, cutoff, label }: { intermediaryId: string; cutoff: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <Button size="sm" disabled={pending} data-testid="start-batch"
        onClick={() => start(async () => { const r = await startBatch(intermediaryId, cutoff); if (r.error) setError(r.error); router.refresh(); })}>{label}</Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function EligibleUnits({ batchId, units }: { batchId: string | null; units: EligibleUnit[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set(units.map((u) => u.id)));
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  if (!units.length) return <p className="text-sm text-muted-foreground">No approved units waiting for this intermediary.</p>;
  return (
    <div className="grid gap-2" data-testid="eligible-units">
      <ul className="grid gap-1 text-sm">
        {units.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2">
            <input type="checkbox" checked={sel.has(u.id)} aria-label={`Select ${u.imei}`}
              onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })} />
            <span className="font-mono text-xs">{u.imei}</span>
            <a href={`/rmas/${u.rmaId}`} className="text-xs underline">{u.rma}</a>
            <span className="text-xs text-muted-foreground">{u.client} · {u.model ?? "—"} · {u.fault}</span>
          </li>
        ))}
      </ul>
      {batchId ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={pending || !sel.size} data-testid="add-to-batch"
            onClick={() => start(async () => { const r = await addToBatch(batchId, [...sel]); setMsg(r.error ? { error: r.error } : { ok: r.message }); router.refresh(); })}>
            Add {sel.size} to the batch
          </Button>
          {msg.error ? <span className="text-xs text-destructive" role="alert">{msg.error}</span> : null}
          {msg.ok ? <span className="text-xs text-emerald-700">{msg.ok}</span> : null}
        </div>
      ) : <p className="text-xs text-muted-foreground">Start this Friday&apos;s batch to add them.</p>}
    </div>
  );
}

export function RemoveFromBatch({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="xs" variant="ghost" disabled={pending} onClick={() => start(async () => { await removeFromBatch(unitId); router.refresh(); })}>Remove</Button>;
}

export function ShipmentForm({ batch }: { batch: { id: string; pickup_date: string | null; carrier: string; awb: string | null; boxes: number | null; weight_kg: number | null; notes: string | null; status: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBatchShipment, {});
  const open = batch.status === "open";
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-5" data-testid="shipment-form">
      <input type="hidden" name="id" value={batch.id} />
      <div className="grid gap-1"><Label className="text-xs">Pickup date</Label><Input type="date" name="pickup_date" defaultValue={batch.pickup_date ?? ""} disabled={!open} /></div>
      <div className="grid gap-1"><Label className="text-xs">Carrier</Label><Input name="carrier" defaultValue={batch.carrier} disabled={!open} /></div>
      <div className="grid gap-1"><Label className="text-xs">AWB</Label><Input name="awb" defaultValue={batch.awb ?? ""} disabled={!open} data-testid="batch-awb" /></div>
      <div className="grid gap-1"><Label className="text-xs">Boxes</Label><Input name="boxes" inputMode="numeric" defaultValue={batch.boxes ?? ""} disabled={!open} /></div>
      <div className="grid gap-1"><Label className="text-xs">Weight (kg)</Label><Input name="weight_kg" inputMode="decimal" defaultValue={batch.weight_kg ?? ""} disabled={!open} /></div>
      <div className="grid gap-1 sm:col-span-4"><Label className="text-xs">Notes</Label><Input name="notes" defaultValue={batch.notes ?? ""} disabled={!open} /></div>
      {open ? (
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
          {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
          {state.message ? <span className="text-xs text-emerald-700">{state.message}</span> : null}
        </div>
      ) : null}
    </form>
  );
}

export function LabelUpload({ batchId }: { batchId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const upload = (file: File) => start(async () => {
    if (file.size > MAX_FILE_BYTES) { setMsg({ error: "The file is larger than 25 MB." }); return; }
    const name = `LABEL_${file.name.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
    const path = `batches/${batchId}/${name}`;
    const { error } = await createClient().storage.from(FILES_BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) { setMsg({ error: error.message }); return; }
    const r = await saveBatchLabel(batchId, path, name);
    setMsg(r.error ? { error: r.error } : { ok: r.message });
    router.refresh();
  });
  return (
    <div className="grid gap-1">
      <input ref={input} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}><Upload className="size-3.5" /> {pending ? "Uploading…" : "Upload label"}</Button>
      {msg.error ? <span className="text-xs text-destructive">{msg.error}</span> : null}
      {msg.ok ? <span className="text-xs text-emerald-700">{msg.ok}</span> : null}
    </div>
  );
}

export function BatchStatusButtons({ batchId, status, units, hasAwb }: { batchId: string; status: string; units: number; hasAwb: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const run = (fn: () => Promise<ActionState>) => start(async () => { const r = await fn(); setMsg(r.error ? { error: r.error } : { ok: r.message }); router.refresh(); });
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-2">
        {status === "open" ? (
          <Button size="sm" disabled={pending || !units || !hasAwb} data-testid="batch-shipped" onClick={() => run(() => markBatchShipped(batchId))}
            title={!hasAwb ? "Save the AWB first" : undefined}>Mark shipped and email Hong Kong</Button>
        ) : null}
        {status === "shipped" ? <Button size="sm" disabled={pending} data-testid="batch-received" onClick={() => run(() => markBatchReceived(batchId))}>Mark received in HK</Button> : null}
      </div>
      {status === "open" && !hasAwb ? <span className="text-xs text-muted-foreground">Save the AWB (and the label) to ship.</span> : null}
      {msg.error ? <span className="text-xs text-destructive" role="alert">{msg.error}</span> : null}
      {msg.ok ? <span className="text-xs text-emerald-700" data-testid="batch-message">{msg.ok}</span> : null}
    </div>
  );
}
