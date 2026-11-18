"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteOrder } from "@/app/(app)/orders/actions";

// "Delete order" (Gabriel, Nov 18 2026): admin only, at the bottom of the Overview tab. The reasons it cannot be deleted
// are shown first; deleting asks to type the order number. The database checks the same rules again (order_delete).
export function DeleteOrder({ orderId, number, blockers }: { orderId: string; number: string; blockers: string[] }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="border-destructive/30" data-testid="delete-order">
      <CardHeader>
        <CardTitle className="text-base">Delete this order</CardTitle>
        <CardDescription>
          Removes {number} with its lines, charges, unconfirmed payments, draft invoice, IMEIs not shipped and its documents. Credit notes
          applied to it become available again. A voided invoice keeps its number. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {blockers.length ? (
          <ul className="grid gap-1 rounded-md bg-muted p-3 text-muted-foreground" data-testid="delete-blockers">
            <li className="font-medium text-foreground">It cannot be deleted yet:</li>
            {blockers.map((b) => <li key={b}>· {b}</li>)}
          </ul>
        ) : !open ? (
          <div><Button type="button" variant="outline" className="text-destructive" onClick={() => setOpen(true)} data-testid="delete-order-start">
            <Trash2 className="size-4" /> Delete order…
          </Button></div>
        ) : (
          <div className="grid gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground"><span>Type <b className="text-foreground">{number}</b> to confirm</span>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="max-w-48 text-foreground" aria-label="Type the order number" autoFocus />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="destructive" disabled={pending || typed.trim().toUpperCase() !== number.toUpperCase()} data-testid="delete-order-confirm"
                onClick={() => start(async () => { const r = await deleteOrder(orderId); if (r?.error) setError(r.error); })}>
                {pending ? "Deleting…" : `Delete ${number} for good`}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setTyped(""); setError(null); }}>Cancel</Button>
            </div>
          </div>
        )}
        {error ? <p className="text-destructive" role="alert">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
