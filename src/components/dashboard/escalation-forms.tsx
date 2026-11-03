"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { TOPICS } from "@/lib/dashboard/escalations";
import { createEscalation, decideEscalation, reopenEscalation, type QueueState } from "@/app/(app)/dashboard/actions";

type Acc = { id: string; label: string };
type Ord = { id: string; account_id: string; label: string };

// New escalation in the SOP §3.5 order. The invoice value comes from the order; evidence = links to the folder/files.
export function EscalationForm({ accounts, orders, defaults }: { accounts: Acc[]; orders: Ord[]; defaults: { account?: string; order?: string } }) {
  const [state, action, pending] = useActionState<QueueState, FormData>(createEscalation, {});
  const [account, setAccount] = useState(defaults.account ?? "");
  const own = orders.filter((o) => o.account_id === account);
  const field = "grid gap-1.5";
  return (
    <form action={action} className="grid gap-3" data-testid="escalation-form">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={field}>
          <Label htmlFor="esc-account">Client</Label>
          <NativeSelect id="esc-account" name="account_id" required value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Choose…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </NativeSelect>
        </div>
        <div className={field}>
          <Label htmlFor="esc-order">Order</Label>
          <NativeSelect id="esc-order" name="order_id" defaultValue={defaults.order ?? ""} key={account}>
            <option value="">— none —</option>
            {own.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </NativeSelect>
        </div>
        <div className={field}>
          <Label htmlFor="esc-topic">About</Label>
          <NativeSelect id="esc-topic" name="topic" defaultValue="other">
            {TOPICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
      </div>
      <div className={field}><Label htmlFor="esc-what">What happened</Label><Textarea id="esc-what" name="what_happened" required rows={2} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={field}><Label htmlFor="esc-evidence">Evidence (links to the folder or files)</Label><Textarea id="esc-evidence" name="evidence" rows={2} /></div>
        <div className={field}><Label htmlFor="esc-figures">Figures (amounts, cap)</Label><Textarea id="esc-figures" name="figures" rows={2} /></div>
        <div className={field}><Label htmlFor="esc-asks">What the client asks</Label><Textarea id="esc-asks" name="client_asks" rows={2} /></div>
        <div className={field}><Label htmlFor="esc-proposal">What you propose</Label><Textarea id="esc-proposal" name="proposal" rows={2} /></div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className={field}><Label htmlFor="esc-by">When the client expects an answer (your time)</Label><Input id="esc-by" name="answer_by" type="datetime-local" className="w-56" /></div>
        <Button type="submit" disabled={pending} data-testid="escalation-submit">{pending ? "Sending…" : "Send to the SD"}</Button>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}

/** Admin (the SD): write the decision; "Answer and close" tells the author. */
export function DecideForm({ id, decision, closed }: { id: string; decision: string | null; closed: boolean }) {
  const [state, action, pending] = useActionState<QueueState, FormData>(decideEscalation, {});
  const [reopening, start] = useTransition();
  if (closed) {
    return (
      <Button type="button" size="xs" variant="ghost" disabled={reopening} onClick={() => start(async () => { await reopenEscalation(id); })}>Reopen</Button>
    );
  }
  return (
    <form action={action} className="grid gap-2" data-testid="decide-form">
      <input type="hidden" name="id" value={id} />
      <Textarea name="decision" defaultValue={decision ?? ""} rows={2} placeholder="Your decision (what the specialist tells the client)" aria-label="Decision" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" name="close" value="1" disabled={pending} data-testid="decide-close">Answer and close</Button>
        <Button type="submit" size="sm" variant="outline" name="close" value="0" disabled={pending}>Save note</Button>
        {state.error ? <span className="text-xs text-destructive">{state.error}</span> : state.message ? <span className="text-xs text-emerald-700">{state.message}</span> : null}
      </div>
    </form>
  );
}
