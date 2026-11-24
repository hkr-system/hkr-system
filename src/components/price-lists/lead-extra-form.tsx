"use client";

import { useActionState } from "react";
import { saveLeadExtra, type PlState } from "@/app/(app)/price-lists/actions";
import { EditLock } from "@/components/edit-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Admin only: the extra margin % of the lead price lists (base × (1 + %), no RMA amortization). Behind the ✏️ like every setting.
export function LeadExtraForm({ pct }: { pct: number }) {
  const [state, action, pending] = useActionState<PlState, FormData>(saveLeadExtra, {});
  return (
    <EditLock label="Edit %" testId="lead-extra-lock">
      <form action={action} className="flex flex-wrap items-end gap-2" data-testid="lead-extra-form">
        <label className="grid gap-1 text-xs text-muted-foreground">Extra margin over the base (%)
          <Input name="pct" defaultValue={String(pct)} inputMode="decimal" className="h-9 w-24 text-right text-foreground" aria-label="Lead extra margin %" />
        </label>
        <Button type="submit" size="sm" disabled={pending} data-testid="lead-extra-save">{pending ? "Saving…" : "Save"}</Button>
        {state.error ? <span className="pb-2 text-xs text-destructive">{state.error}</span> : null}
        {state.message ? <span className="pb-2 text-xs text-emerald-700" data-testid="lead-extra-saved">{state.message}</span> : null}
      </form>
    </EditLock>
  );
}
