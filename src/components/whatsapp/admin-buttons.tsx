"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { TableCell, TableRow } from "@/components/ui/table";
import { importNumbers, refreshNumberHealth, syncTemplates, updateNumber, updateNumberByMarket, type WaState } from "@/app/(app)/whatsapp/actions";

function useAction(fn: () => Promise<WaState>) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<WaState>({});
  return { pending, state, run: () => start(async () => setState(await fn())) };
}

function Result({ state }: { state: WaState }) {
  if (state.error) return <span className="text-xs text-destructive">{state.error}</span>;
  if (state.message || state.ok) return <span className="text-xs text-emerald-700 dark:text-emerald-400">{state.message ?? "Done."}</span>;
  return null;
}

export function SyncTemplatesButton() {
  const a = useAction(syncTemplates);
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={a.run} disabled={a.pending}>{a.pending ? "Syncing…" : "Sync from Meta"}</Button>
      <Result state={a.state} />
    </div>
  );
}

export function ImportNumbersButton() {
  const a = useAction(importNumbers);
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={a.run} disabled={a.pending}>{a.pending ? "Reading…" : "Import numbers from Meta"}</Button>
      <Result state={a.state} />
    </div>
  );
}

export function HealthButton({ id }: { id: string }) {
  const a = useAction(() => refreshNumberHealth(id));
  return (
    <span className="inline-flex flex-wrap items-center gap-1 break-words">
      <Button size="xs" variant="outline" onClick={a.run} disabled={a.pending}>{a.pending ? "…" : "Check"}</Button>
      <Result state={a.state} />
    </span>
  );
}

export type NumberRow = {
  id: string; label: string | null; display_phone: string; market: string | null; daily_broadcast_limit: number;
  broadcasts_paused: boolean; paused_reason: string | null; active: boolean; is_demo: boolean;
  quality_rating: string | null; messaging_tier: string | null; verified_name: string | null;
};

export function NumberEditRow({ n }: { n: NumberRow }) {
  const [state, action, pending] = useActionState(updateNumber, {});
  const q = n.quality_rating;
  return (
    <TableRow>
      <TableCell className="w-80 max-w-80 align-top whitespace-normal">
        <div className="font-medium">{n.display_phone}</div>
        <div className="text-xs text-muted-foreground">{n.verified_name ?? ""}{n.is_demo ? " · demo" : ""}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className={q === "RED" ? "text-destructive" : q === "YELLOW" ? "text-amber-600" : ""}>Quality {q ?? "—"}</span>
          <span>· {n.messaging_tier ?? "tier —"}</span>
          {!n.is_demo ? <HealthButton id={n.id} /> : null}
        </div>
      </TableCell>
      <TableCell colSpan={2} className="whitespace-normal">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={n.id} />
          <Input name="label" defaultValue={n.label ?? ""} placeholder="Label (HK-1, NL…)" className="h-8 w-32" aria-label="Label" />
          <NativeSelect name="market" defaultValue={n.market ?? ""} className="h-8 w-28" aria-label="Market">
            <option value="">Market —</option>
            {["EU", "LATAM", "US", "ROW"].map((m) => <option key={m}>{m}</option>)}
          </NativeSelect>
          <label className="flex items-center gap-1 text-xs">Daily limit
            <Input name="daily_broadcast_limit" type="number" min={0} defaultValue={n.daily_broadcast_limit} className="h-8 w-20" />
          </label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="broadcasts_paused" defaultChecked={n.broadcasts_paused} /> Pause broadcasts</label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={n.active} /> Active</label>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
          <Result state={state} />
          {n.broadcasts_paused && n.paused_reason ? <span className="w-full text-xs text-amber-700">{n.paused_reason}</span> : null}
        </form>
      </TableCell>
    </TableRow>
  );
}

export function NumberByMarketForm({ value, numbers }: { value: Record<string, string | null>; numbers: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(updateNumberByMarket, {});
  return (
    <form action={action} className="grid gap-3" data-testid="number-by-market">
      <div className="grid gap-3 sm:grid-cols-4">
        {["EU", "LATAM", "US", "ROW"].map((m) => (
          <label key={m} className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">{m}</span>
            <NativeSelect name={m} defaultValue={value[m] ?? ""}>
              <option value="">Not set</option>
              {numbers.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </NativeSelect>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
        <Result state={state} />
      </div>
    </form>
  );
}
