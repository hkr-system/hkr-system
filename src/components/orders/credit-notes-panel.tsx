"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { applyCreditNote, approvePendingCreditNote, createCreditNoteOnOrder, deletePendingCreditNote, removeCreditNote } from "@/app/(app)/orders/invoice-actions";
import { money } from "@/lib/orders/constants";

export type AppliedCn = { id: string; credit_note_id: string; number: string; amount: number };
export type AvailableCn = { id: string; number: string; amount: number; left: number; reason: string | null; rma: string | null };
export type PendingCn = { id: string; number: string; amount: number; reason: string | null };

// The order's "RMA discount" = credit notes applied to it (Gabriel, Nov 3 2026). Each one prints as
// "Credit note <number>" on the invoice. A credit note can be split across several orders.
export function CreditNotesPanel({ orderId, applied, available, pending: waiting = [], canEdit, frozen, isAdmin }: {
  orderId: string; applied: AppliedCn[]; available: AvailableCn[]; pending?: PendingCn[]; canEdit: boolean; frozen: boolean; isAdmin: boolean;
}) {
  const [reason, setReason] = useState("RMA discount");
  const [newAmount, setNewAmount] = useState("");
  const [cn, setCn] = useState(available[0]?.id ?? "");
  const pick = available.find((a) => a.id === cn);
  const [amount, setAmount] = useState(pick ? String(pick.left) : "");
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const total = applied.reduce((s, a) => s + a.amount, 0);
  const run = (f: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => start(async () => {
    const r = await f(); setMsg(r.error ? { text: r.error } : { ok: true, text: r.message ?? "Saved." });
  });

  return (
    <div className="grid gap-3 text-sm" data-testid="credit-notes-panel">
      {applied.length ? (
        <ul className="grid gap-1.5">
          {applied.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="cn-applied">
              <Link href={`/rmas/credit-notes/${a.credit_note_id}`} className="font-medium hover:underline">Credit note {a.number}</Link>
              <span className="tabular-nums">−{money(a.amount)}</span>
              {canEdit && !frozen ? (
                <Button type="button" size="xs" variant="ghost" disabled={pending} className="ml-auto"
                  onClick={() => run(() => removeCreditNote(a.id))}>Remove</Button>
              ) : null}
            </li>
          ))}
          <li className="flex justify-between border-t pt-1 font-medium"><span>Discount on this invoice</span><span className="tabular-nums">−{money(total)}</span></li>
        </ul>
      ) : <p className="text-muted-foreground">No credit note on this order.</p>}

      {waiting.length ? (
        <ul className="grid gap-1.5 rounded-md bg-amber-50 p-2 text-amber-900" data-testid="cn-pending">
          {waiting.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href={`/rmas/credit-notes/${w.id}`} className="font-medium hover:underline">Credit note {w.number}</Link>
              <span className="tabular-nums">−{money(w.amount)}</span>
              <span className="text-xs">{w.reason ? `${w.reason} · ` : ""}waiting for the SD — applied here when approved</span>
              <span className="ml-auto flex gap-1">
                {isAdmin ? <Button type="button" size="xs" disabled={pending} data-testid="cn-approve" onClick={() => run(() => approvePendingCreditNote(w.id))}>Approve and apply</Button> : null}
                {canEdit ? <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={() => run(() => deletePendingCreditNote(w.id, orderId))}>Delete</Button> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {frozen ? (
        <p className="text-xs text-muted-foreground">The invoice is approved, so its credit notes are locked.{isAdmin ? " Reopen the invoice (Invoice panel) to add or remove one." : " An admin reopens it to change them."}</p>
      ) : canEdit ? (
        available.length ? (
          <div className="flex flex-wrap items-end gap-2" data-testid="cn-apply">
            <label className="grid min-w-0 flex-1 gap-1">
              <span className="text-xs text-muted-foreground">Credit note (approved, with an amount left)</span>
              <NativeSelect value={cn} aria-label="Credit note" onChange={(e) => { setCn(e.target.value); const a = available.find((x) => x.id === e.target.value); setAmount(a ? String(a.left) : ""); }}>
                {available.map((a) => (
                  <option key={a.id} value={a.id}>{a.number} · {money(a.left)} left of {money(a.amount)}{a.rma ? ` · ${a.rma}` : ""}{a.reason ? ` · ${a.reason.slice(0, 40)}` : ""}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Amount US$</span>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-8 w-28 text-right" aria-label="Amount to apply" />
            </label>
            <Button type="button" size="sm" variant="outline" disabled={pending || !cn} data-testid="cn-apply-button"
              onClick={() => run(() => applyCreditNote(orderId, cn, Number(amount.replace(/,/g, ""))))}>Apply</Button>
          </div>
        ) : <p className="text-xs text-muted-foreground">No approved credit note with an amount left for this client.</p>
      ) : null}
      {canEdit && !frozen ? (
        <div className="grid gap-2 rounded-md border border-dashed p-2 sm:grid-cols-[1fr_auto_auto] sm:items-end" data-testid="cn-create">
          <label className="grid gap-1 text-xs text-muted-foreground">New credit note · reason
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="h-8 text-foreground" aria-label="New credit note reason" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Amount US$
            <Input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} inputMode="decimal" className="h-8 w-28 text-right text-foreground" aria-label="New credit note amount" />
          </label>
          <Button type="button" size="sm" variant="outline" disabled={pending || !(Number(newAmount.replace(/,/g, "")) > 0)} data-testid="cn-create-button"
            onClick={() => run(async () => { const r = await createCreditNoteOnOrder(orderId, reason, Number(newAmount.replace(/,/g, ""))); if (!r.error) setNewAmount(""); return r; })}>
            {isAdmin ? "Create and apply" : "Create (SD approves)"}
          </Button>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            {isAdmin ? "Created, approved and applied to this order at once." : "Goes to the SD as a draft; applied to this order by itself once the admin approves it."} To link it to an RMA, open the credit note afterwards.
          </p>
        </div>
      ) : null}
      {msg ? <p className={msg.ok ? "text-xs text-emerald-700" : "text-xs text-destructive"}>{msg.text}</p> : null}
    </div>
  );
}
