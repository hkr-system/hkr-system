"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { money } from "@/lib/orders/constants";
import type { AvailableCreditNote } from "@/lib/orders/credit-notes";

export type CnUse = { credit_note_id: string; amount: string };
export type CnNew = { key: string; reason: string; amount: string };

const n = (s: string) => Math.round((Number(String(s).replace(/,/g, "")) || 0) * 100) / 100;
export const cnUseSum = (u: CnUse[]) => u.reduce((t, x) => t + n(x.amount), 0);
export const cnNewSum = (c: CnNew[]) => c.reduce((t, x) => t + n(x.amount), 0);
export const cnProblem = (use: CnUse[], made: CnNew[], available: AvailableCreditNote[]) => {
  for (const u of use) {
    const a = available.find((x) => x.id === u.credit_note_id);
    if (a && (n(u.amount) <= 0 || n(u.amount) > a.left)) return `Credit note ${a.number}: between US$0.01 and ${money(a.left)}.`;
  }
  if (made.some((m) => n(m.amount) <= 0)) return "New credit note: write the amount.";
  return null;
};

/**
 * "Credit notes (RMA discount)" inside the order form (Gabriel, Nov 17 2026): use an approved credit note of the client
 * or create one here, without leaving the order. Each one prints on the invoice as "Credit note <number>".
 */
export function OrderCreditNotes({ available, use, setUse, made, setMade, isAdmin, accountChosen }: {
  available: AvailableCreditNote[]; use: CnUse[]; setUse: (u: CnUse[]) => void; made: CnNew[]; setMade: (m: CnNew[]) => void;
  isAdmin: boolean; accountChosen: boolean;
}) {
  const free = available.filter((a) => !use.some((u) => u.credit_note_id === a.id));
  return (
    <Card data-testid="order-credit-notes">
      <CardHeader>
        <CardTitle className="text-base">Credit notes (RMA discount)</CardTitle>
        <CardDescription>
          A discount for RMAs is always a credit note: use one the client already has, or create it here. Each prints on the invoice as “Credit note &lt;number&gt;”.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <input type="hidden" name="cn_apply" value={JSON.stringify(use.map((u) => ({ credit_note_id: u.credit_note_id, amount: n(u.amount) })))} />
        <input type="hidden" name="cn_new" value={JSON.stringify(made.map((m) => ({ reason: m.reason, amount: n(m.amount) })))} />
        {!accountChosen ? <p className="text-muted-foreground">Choose the client first.</p> : null}

        {use.map((u, i) => {
          const a = available.find((x) => x.id === u.credit_note_id);
          if (!a) return null;
          return (
            <div key={u.credit_note_id} className="flex flex-wrap items-end gap-2 rounded-md border p-2" data-testid="cn-use-row">
              <div className="min-w-0 flex-1">
                <div className="font-medium">Credit note {a.number}</div>
                <div className="text-xs text-muted-foreground">{money(a.left)} left of {money(a.amount)}{a.rma ? ` · ${a.rma}` : ""}{a.reason ? ` · ${a.reason}` : ""}</div>
              </div>
              <label className="grid gap-1 text-xs text-muted-foreground">Amount US$
                <Input value={u.amount} inputMode="decimal" className="h-8 w-28 text-right text-foreground" aria-label={`Amount of ${a.number}`}
                  onChange={(e) => setUse(use.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              </label>
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${a.number}`} onClick={() => setUse(use.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}

        {made.map((m, i) => (
          <div key={m.key} className="grid gap-2 rounded-md border border-dashed p-2 sm:grid-cols-[1fr_auto_auto] sm:items-end" data-testid="cn-new-row">
            <label className="grid gap-1 text-xs text-muted-foreground">New credit note · reason
              <Input value={m.reason} maxLength={200} placeholder="e.g. RMA discount (AMS-NL-901-RMA-03)" className="text-foreground" aria-label="Credit note reason"
                onChange={(e) => setMade(made.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">Amount US$
              <Input value={m.amount} inputMode="decimal" className="w-28 text-right text-foreground" aria-label="Credit note amount"
                onChange={(e) => setMade(made.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            </label>
            <Button type="button" size="icon" variant="ghost" aria-label="Remove the new credit note" onClick={() => setMade(made.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              {isAdmin ? "Created and approved by you when the order is saved, and applied to this invoice."
                : "Saved as a draft for the SD when the order is saved. It is applied to this invoice by itself once the admin approves it — until then it is not in the total."}
            </p>
          </div>
        ))}

        {accountChosen ? (
          <div className="flex flex-wrap items-center gap-2">
            {free.length ? (
              <NativeSelect value="" aria-label="Use a credit note of the client" data-testid="cn-use" className="w-auto min-w-64"
                onChange={(e) => { const a = free.find((x) => x.id === e.target.value); if (a) setUse([...use, { credit_note_id: a.id, amount: String(a.left) }]); }}>
                <option value="">Use a credit note of the client…</option>
                {free.map((a) => <option key={a.id} value={a.id}>{a.number} · {money(a.left)} left{a.reason ? ` · ${a.reason.slice(0, 40)}` : ""}</option>)}
              </NativeSelect>
            ) : <span className="text-xs text-muted-foreground">The client has no approved credit note with an amount left.</span>}
            <Button type="button" size="sm" variant="outline" data-testid="cn-new" onClick={() => setMade([...made, { key: `n${Date.now()}`, reason: "RMA discount", amount: "" }])}>
              <Plus className="size-4" /> New credit note
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
