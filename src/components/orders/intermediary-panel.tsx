"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { saveIntermediaryInvoice, type ActionState } from "@/app/(app)/orders/actions";
import { FileUpload } from "@/components/orders/file-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditLock } from "@/components/edit-lock";

// Route via an EU intermediary (Gabriel, Nov 2 2026): we invoice the intermediary in USD; the intermediary invoices the
// client in EUR (added here when it arrives); the client pays the intermediary, the intermediary pays US in USD.
export function IntermediaryPanel({ orderId, accountId, accountCode, orderNumber, intermediary, no, eur, depositWithIntermediary, editable }: {
  orderId: string; accountId: string; accountCode: string; orderNumber: string; intermediary: string;
  no: string | null; eur: number | null; depositWithIntermediary: boolean; editable: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveIntermediaryInvoice, {});
  return (
    <div className="grid gap-3" data-testid="intermediary-panel">
      <EditLock><form action={action} className="grid gap-3" key={`${no}-${eur}-${depositWithIntermediary}`}>
        <input type="hidden" name="order_id" value={orderId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1"><Label htmlFor="pin">{intermediary} invoice no. (INV-EU)</Label><Input id="pin" name="partner_invoice_no" defaultValue={no ?? ""} disabled={!editable} placeholder="When the intermediary sends it" /></div>
          <div className="grid gap-1"><Label htmlFor="pie">Amount the client pays them (EUR)</Label><Input id="pie" name="partner_invoice_eur" defaultValue={eur ?? ""} inputMode="decimal" disabled={!editable} /></div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="deposit_with_intermediary" defaultChecked={depositWithIntermediary} disabled={!editable} className="mt-0.5 size-4" />
          <span>The intermediary keeps the deposit and sends us 100 % when the order is ready <span className="text-muted-foreground">(usually when the deposit is small, under ~US$5k). We then expect no deposit, only the full balance in USD.</span></span>
        </label>
        {editable ? (
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "…" : "Save"}</Button>
            {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
            {state.ok ? <Check className="size-4 text-emerald-600" aria-label="Saved" /> : null}
          </div>
        ) : null}
      </form></EditLock>
      {editable ? <FileUpload accountId={accountId} accountCode={accountCode} orderId={orderId} orderNumber={orderNumber} kinds={["INV-EU"]} label="Upload their invoice (INV-EU)" /> : null}
    </div>
  );
}
