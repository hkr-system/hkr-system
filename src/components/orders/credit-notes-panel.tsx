"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { applyCreditNote, removeCreditNote } from "@/app/(app)/orders/invoice-actions";
import { money } from "@/lib/orders/constants";

export type AppliedCn = { id: string; credit_note_id: string; number: string; amount: number };
export type AvailableCn = { id: string; number: string; amount: number; left: number; reason: string | null; rma: string | null };

// The order's "RMA discount" = credit notes applied to it (Gabriel, Nov 3 2026). Each one prints as
// "Credit note <number>" on the invoice. A credit note can be split across several orders.
export function CreditNotesPanel({ orderId, accountId, applied, available, canEdit, frozen, isAdmin }: {
  orderId: string; accountId: string; applied: AppliedCn[]; available: AvailableCn[]; canEdit: boolean; frozen: boolean; isAdmin: boolean;
}) {
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
        <Link href={`/rmas/credit-notes/new?account=${accountId}&order=${orderId}`} className="text-xs text-muted-foreground hover:underline">+ New credit note for this client (with or without an RMA) — the admin approves it, then you apply it here</Link>
      ) : null}
      {msg ? <p className={msg.ok ? "text-xs text-emerald-700" : "text-xs text-destructive"}>{msg.text}</p> : null}
    </div>
  );
}
