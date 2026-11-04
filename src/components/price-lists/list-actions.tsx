"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { approveList, deleteDraft, prepareList, removeRow, setPercentages, type PlState } from "@/app/(app)/price-lists/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditLock } from "@/components/edit-lock";

function useRun() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<PlState>({});
  const run = (fn: () => Promise<PlState>) => start(async () => { setState(await fn()); });
  return { pending, state, run };
}
function Msg({ s }: { s: PlState }) {
  if (s.error) return <span className="text-sm text-destructive" role="alert">{s.error}</span>;
  if (s.message) return <span className="text-sm text-emerald-700">{s.message}</span>;
  return null;
}

export function PrepareListButton({ accountId, label = "Prepare new list", primary = false }: { accountId: string; label?: string; primary?: boolean }) {
  const { pending, state, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={primary ? "default" : "outline"} disabled={pending} onClick={() => run(() => prepareList(accountId))} data-testid="prepare-list">
        {pending ? "Running the engine…" : label}
      </Button>
      <Msg s={state} />
    </div>
  );
}

export function DraftActions({ listId, isAdmin }: { listId: string; isAdmin: boolean }) {
  const { pending, state, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isAdmin ? <Button size="sm" disabled={pending} onClick={() => run(() => approveList(listId))} data-testid="approve-list">Approve</Button> : null}
      <Button size="sm" variant="outline" disabled={pending}
        onClick={() => { if (confirm("Delete this draft?")) run(() => deleteDraft(listId)); }}>Delete draft</Button>
      {!isAdmin ? <span className="text-sm text-muted-foreground">Waiting for the admin&apos;s approval.</span> : null}
      <Msg s={state} />
    </div>
  );
}

export function RemoveRowButton({ rowId, listId }: { rowId: string; listId: string }) {
  const { pending, run } = useRun();
  return (
    <Button type="button" size="icon" variant="ghost" disabled={pending} aria-label="Remove this model from the list" onClick={() => run(() => removeRow(rowId, listId))}>
      <Trash2 className="size-4" />
    </Button>
  );
}

export function PercentForm({ listId, rma, extra }: { listId: string; rma: number; extra: number }) {
  const [state, action, pending] = useActionState(setPercentages, {});
  return (
    <EditLock><form action={action} className="flex flex-wrap items-end gap-3" data-testid="percent-form">
      <input type="hidden" name="id" value={listId} />
      <div className="grid gap-1"><Label htmlFor="rma_c">RMA_c %</Label><Input id="rma_c" name="rma_c" defaultValue={rma} inputMode="decimal" className="w-24" /></div>
      <div className="grid gap-1"><Label htmlFor="extra_c">Extra_c %</Label><Input id="extra_c" name="extra_c" defaultValue={extra} inputMode="decimal" className="w-24" /></div>
      <div className="grid gap-1"><Label htmlFor="note">Why (optional)</Label><Input id="note" name="note" className="w-56" placeholder="e.g. agreed with David" /></div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "…" : "Recalculate prices"}</Button>
      <Msg s={state} />
    </form></EditLock>
  );
}
