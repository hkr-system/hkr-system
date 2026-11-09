"use client";

import { useActionState, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { addIntermediary, deleteIntermediary, updateIntermediary, type SettingState } from "./actions";

export type IntermediaryRow = {
  id: string; name: string; country: string | null; contact: string | null; address: string | null;
  default_cutoff_weekday: number | null; orders: number; clients: number; batches: number;
};

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Settings → Intermediaries (Gabriel, Nov 9 2026): the list of companies that invoice the client for us, like an
// address book — add, correct, and remove one that nothing uses. The order form picks from this list.
export function IntermediariesEditor({ rows }: { rows: IntermediaryRow[] }) {
  return (
    <div className="grid gap-4" data-testid="intermediaries">
      <AddForm />
      {rows.length ? rows.map((r) => <Row key={r.id} r={r} />) : <p className="text-sm text-muted-foreground">No intermediaries yet.</p>}
    </div>
  );
}

function Fields({ r }: { r?: IntermediaryRow }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.6fr_10rem]">
      <Input name="name" defaultValue={r?.name ?? ""} placeholder="Company (e.g. Galimix)" maxLength={80} required aria-label="Company name" />
      <Input name="country" defaultValue={r?.country ?? ""} placeholder="Country" maxLength={60} aria-label="Country" />
      <Input name="contact" defaultValue={r?.contact ?? ""} placeholder="Contact name / email" maxLength={120} aria-label="Contact" />
      <Input name="address" defaultValue={r?.address ?? ""} placeholder="Address" maxLength={240} aria-label="Address" />
      <NativeSelect name="default_cutoff_weekday" defaultValue={String(r?.default_cutoff_weekday ?? "")} aria-label="RMA batch cut-off day">
        <option value="">No RMA batch day</option>
        {DAYS.slice(1).map((d, i) => <option key={d} value={String(i + 1)}>Batch: {d}</option>)}
      </NativeSelect>
    </div>
  );
}

function Status({ state }: { state: SettingState }) {
  if (state.error) return <span className="text-xs text-destructive">{state.error}</span>;
  if (state.ok) return <Check className="size-4 text-emerald-600" aria-label="Saved" />;
  return null;
}

function AddForm() {
  const [state, action, pending] = useActionState(addIntermediary, {});
  return (
    <form action={action} className="grid gap-2 rounded-lg border border-dashed p-3" data-testid="intermediary-add">
      <span className="text-sm font-medium">Add an intermediary</span>
      <Fields />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
        <Status state={state} />
      </div>
    </form>
  );
}

function Row({ r }: { r: IntermediaryRow }) {
  const [state, action, pending] = useActionState(updateIntermediary, {});
  const [del, setDel] = useState<SettingState>({});
  const [deleting, start] = useTransition();
  const used = r.orders + r.clients + r.batches;
  return (
    <form key={`${r.name}-${r.country}-${r.contact}-${r.address}-${r.default_cutoff_weekday}`} action={action}
      className="grid gap-2 rounded-lg border p-3" data-testid={`intermediary-${r.name}`}>
      <input type="hidden" name="id" value={r.id} />
      <Fields r={r} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "…" : "Save"}</Button>
        <span className="text-xs text-muted-foreground">
          {r.orders} order{r.orders === 1 ? "" : "s"} · {r.clients} client{r.clients === 1 ? "" : "s"} last used it{r.batches ? ` · ${r.batches} RMA batch${r.batches === 1 ? "" : "es"}` : ""}
        </span>
        {used === 0 ? (
          <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={deleting}
            onClick={() => { if (confirm(`Remove ${r.name}?`)) start(async () => setDel(await deleteIntermediary(r.id))); }}>Remove</Button>
        ) : null}
        <Status state={del.error ? del : state} />
      </div>
    </form>
  );
}
