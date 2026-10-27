"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addOrderNote, confirmPayment, deletePayment, loadImeis, recordPayment, saveShipping, setOrderStatus, type ActionState,
} from "@/app/(app)/orders/actions";
import { parseImeis } from "@/lib/orders/imei";
import {
  DELIVERY_SETUP_LABEL, DIFFERENCE_REASONS, ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_DRIVEN, PAYMENT_METHOD_LABEL,
  PAYMENT_TYPE_LABEL, money, nextStatus, type DeliverySetup, type OrderStatus, type PaymentMethod,
} from "@/lib/orders/constants";
import { FileUpload } from "@/components/orders/file-upload";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function StatusControls({ orderId, status, isAdmin }: { orderId: string; status: OrderStatus; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = nextStatus(status);
  const run = (s: OrderStatus) => start(async () => {
    setError(null);
    const r = await setOrderStatus(orderId, s);
    if (r.error) setError(r.error);
    router.refresh();
  });
  const byPayment = next ? PAYMENT_DRIVEN.includes(next) : false;
  return (
    <div className="grid gap-2" data-testid="status-controls">
      <div className="flex flex-wrap items-center gap-2">
        {next && !byPayment ? (
          <Button size="sm" disabled={pending} onClick={() => run(next)} data-testid="advance">Mark {ORDER_STATUS_LABEL[next]}</Button>
        ) : null}
        {next && byPayment ? (
          <span className="text-xs text-muted-foreground">Moves to {ORDER_STATUS_LABEL[next]} when an admin confirms the {next === "deposit_paid" ? "deposit" : "balance"}.</span>
        ) : null}
        {isAdmin ? (
          <NativeSelect value="" onChange={(e) => e.target.value && run(e.target.value as OrderStatus)} className="w-auto" aria-label="Set status (admin)" disabled={pending}>
            <option value="">Set status (admin)…</option>
            {ORDER_STATUSES.filter((s) => s !== status).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
          </NativeSelect>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive" role="alert" data-testid="status-error">{error}</p> : null}
    </div>
  );
}

type Payment = {
  id: string; type: "deposit" | "balance" | "other"; amount: number; currency: "USD" | "EUR"; method: PaymentMethod; received_at: string;
  reference: string | null; expected_amount: number | null; difference: number | null; difference_reason: string | null;
  status: "awaiting_confirmation" | "confirmed"; proof_file_id: string | null; notes: string | null;
};

export function PaymentsPanel({ orderId, accountId, accountCode, orderNumber, payments, isAdmin, defaultMethod, payCurrency, dueDeposit, dueBalance, showForm = true }: {
  orderId: string; accountId: string; accountCode: string; orderNumber: string; payments: Payment[]; isAdmin: boolean;
  defaultMethod: PaymentMethod; payCurrency: "USD" | "EUR"; dueDeposit: number; dueBalance: number; showForm?: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(recordPayment, {});
  const [type, setType] = useState<"deposit" | "balance" | "other">(dueDeposit > 0 ? "deposit" : "balance");
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const due = type === "deposit" ? dueDeposit : type === "balance" ? dueBalance : null;
  const diff = due !== null && amount ? Number(amount) - due : null;
  const reasonLabel = (k: string | null) => DIFFERENCE_REASONS.find(([v]) => v === k)?.[1] ?? "";

  return (
    <div className="grid gap-4" data-testid="payments">
      <div className="grid gap-2">
        {payments.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2 text-sm" data-testid="payment-row">
            <span className="font-medium">{PAYMENT_TYPE_LABEL[p.type]}</span>
            <span data-tabular>{money(p.amount, p.currency)}</span>
            <span className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABEL[p.method]} · {p.received_at}{p.reference ? ` · ${p.reference}` : ""}</span>
            {p.difference !== null && Number(p.difference) !== 0 ? (
              <span className={`text-xs ${Number(p.difference) < 0 ? "text-destructive" : "text-amber-700"}`}>
                diff {money(p.difference, p.currency)}{p.difference_reason ? ` (${reasonLabel(p.difference_reason)})` : ""}
              </span>
            ) : null}
            {p.proof_file_id ? <a href={`/api/files/${p.proof_file_id}`} target="_blank" rel="noreferrer" className="text-xs underline">proof</a> : null}
            <span className={`ml-auto text-xs font-medium ${p.status === "confirmed" ? "text-emerald-700" : "text-amber-700"}`}>
              {p.status === "confirmed" ? "Confirmed" : "Awaiting confirmation"}
            </span>
            {isAdmin && p.status !== "confirmed" ? (
              <Button size="xs" disabled={busy} data-testid="confirm-payment"
                onClick={() => start(async () => { await confirmPayment(p.id, null); router.refresh(); })}>Confirm credit</Button>
            ) : null}
            {isAdmin ? (
              <Button size="xs" variant="ghost" disabled={busy}
                onClick={() => { if (confirm("Delete this payment record?")) start(async () => { await deletePayment(p.id); router.refresh(); }); }}>Delete</Button>
            ) : null}
            {p.notes ? <span className="w-full text-xs text-muted-foreground">{p.notes}</span> : null}
          </div>
        ))}
        {!payments.length ? <p className="text-sm text-muted-foreground">No payments recorded.</p> : null}
      </div>

      {showForm ? <form action={action} className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-3" data-testid="payment-form">
        <p className="text-sm font-medium sm:col-span-3">Record a payment proof (SOP P3)</p>
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="proof_file_id" value={proof ?? ""} />
        <div className="grid gap-1.5"><Label>Type</Label>
          <NativeSelect name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {Object.entries(PAYMENT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>Amount on the proof ({payCurrency})</Label>
          <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          {due !== null ? <span className="text-xs text-muted-foreground">Due: {money(due, payCurrency)}{diff !== null && Math.abs(diff) > 0.004 ? ` · difference ${money(diff, payCurrency)}` : ""}</span> : null}
        </div>
        <div className="grid gap-1.5"><Label>Method</Label>
          <NativeSelect name="method" defaultValue={defaultMethod}>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>Value date</Label><Input type="date" name="received_at" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
        <div className="grid gap-1.5"><Label>Reference (MT103 / TXID)</Label><Input name="reference" /></div>
        <div className="grid gap-1.5"><Label>Reason of a difference</Label>
          <NativeSelect name="difference_reason" defaultValue="">
            <option value="">—</option>
            {DIFFERENCE_REASONS.filter(([k]) => k !== "none").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5 sm:col-span-2"><Label>Note</Label><Input name="notes" placeholder="e.g. charges SHA, wallet checked on Tronscan" /></div>
        <div className="grid gap-1.5"><Label>Proof file</Label>
          {proof ? <span className="text-xs text-emerald-700">Proof attached ✓</span> : (
            <FileUpload accountId={accountId} accountCode={accountCode} orderId={orderId} orderNumber={orderNumber}
              kinds={[type === "balance" ? "PP-BAL" : "PP-DEP"]} label="Attach proof" onUploaded={(id) => setProof(id)} />
          )}
        </div>
        <div className="flex items-center gap-3 sm:col-span-3">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Record payment</Button>
          {state.error ? <span className="text-sm text-destructive" role="alert">{state.error}</span> : null}
          {state.message ? <span className="text-sm text-emerald-700">{state.message}</span> : null}
          <span className="text-xs text-muted-foreground">Never tell the client “received” before an admin confirms the credit.</span>
        </div>
      </form> : null}
    </div>
  );
}

export function ShippingPanel({ orderId, accountId, accountCode, orderNumber, courier, tracking, eta, setup, imeiCount, labelOk, balanceOk }: {
  orderId: string; accountId: string; accountCode: string; orderNumber: string; courier: string | null; tracking: string | null;
  eta: string | null; setup: DeliverySetup; imeiCount: number; labelOk: boolean; balanceOk: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(saveShipping, {});
  const [imeiMsg, setImeiMsg] = useState<{ ok?: string; error?: string; detail?: string }>({});

  async function readFileText(file: File) {
    if (/\.xlsx$/i.test(file.name)) {
      const { readSheet } = await import("read-excel-file/browser");
      const rows = await readSheet(file);
      return rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : typeof c === "number" ? c.toFixed(0) : String(c))).join(" ")).join("\n");
    }
    return file.text();
  }

  async function onImeiFile(_fileId: string, file: File) {
    const text = await readFileText(file);
    const local = parseImeis(text);
    const r = await loadImeis(orderId, text);
    if (r.error) { setImeiMsg({ error: r.error }); return; }
    const bad = local.badCheckDigit.length + local.wrongLength.length;
    setImeiMsg({
      ok: `${r.added} IMEIs loaded into the IMEI master.`,
      detail: [
        r.duplicates?.length ? `${r.duplicates.length} already in the master (not loaded again): ${r.duplicates.slice(0, 5).join(", ")}${r.duplicates.length > 5 ? "…" : ""}` : "",
        bad ? `${bad} invalid numbers ignored: ${[...local.badCheckDigit, ...local.wrongLength].slice(0, 5).join(", ")}${bad > 5 ? "…" : ""}` : "",
        local.repeated.length ? `${local.repeated.length} repeated in the file.` : "",
      ].filter(Boolean).join(" · "),
    });
    router.refresh();
  }

  return (
    <div className="grid gap-4" data-testid="shipping">
      <ul className="grid gap-1 text-sm">
        <li className={balanceOk ? "text-emerald-700" : "text-muted-foreground"}>{balanceOk ? "✓" : "○"} Balance confirmed by an admin</li>
        <li className={imeiCount ? "text-emerald-700" : "text-muted-foreground"}>{imeiCount ? "✓" : "○"} IMEI list loaded ({imeiCount} units)</li>
        <li className={labelOk ? "text-emerald-700" : "text-muted-foreground"}>{labelOk ? "✓" : "○"} {setup === "client_label" ? "Client label uploaded" : "Courier booked"}</li>
        <li className={tracking ? "text-emerald-700" : "text-muted-foreground"}>{tracking ? "✓" : "○"} AWB / tracking entered</li>
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>IMEI list from Hong Kong (xlsx, csv or txt)</Label>
          <FileUpload accountId={accountId} accountCode={accountCode} orderId={orderId} orderNumber={orderNumber} kinds={["IMEI"]}
            label="Upload IMEI list" onUploaded={onImeiFile} testId="imei-upload" />
          {imeiMsg.error ? <p className="text-xs text-destructive" role="alert">{imeiMsg.error}</p> : null}
          {imeiMsg.ok ? <p className="text-xs text-emerald-700" data-testid="imei-result">{imeiMsg.ok}</p> : null}
          {imeiMsg.detail ? <p className="text-xs text-amber-700">{imeiMsg.detail}</p> : null}
        </div>
        {setup === "client_label" ? (
          <div className="grid gap-1.5">
            <Label>Client label</Label>
            <FileUpload accountId={accountId} accountCode={accountCode} orderId={orderId} orderNumber={orderNumber} kinds={["LABEL"]} label="Upload label" testId="label-upload" />
          </div>
        ) : null}
      </div>
      <form action={action} className="grid gap-3 sm:grid-cols-4" data-testid="shipping-form">
        <input type="hidden" name="order_id" value={orderId} />
        <div className="grid gap-1.5"><Label>Delivery set-up</Label>
          <NativeSelect name="delivery_setup" defaultValue={setup}>
            {Object.entries(DELIVERY_SETUP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>Courier</Label><Input name="courier" defaultValue={courier ?? ""} placeholder="DHL, UPS, FedEx…" /></div>
        <div className="grid gap-1.5"><Label>AWB / tracking</Label><Input name="tracking" defaultValue={tracking ?? ""} /></div>
        <div className="grid gap-1.5"><Label>ETA</Label><Input type="date" name="eta_date" defaultValue={eta ?? ""} /></div>
        <div className="flex items-center gap-3 sm:col-span-4">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Save shipping details</Button>
          {state.error ? <span className="text-sm text-destructive" role="alert">{state.error}</span> : null}
          {state.message ? <span className="text-sm text-emerald-700">{state.message}</span> : null}
        </div>
      </form>
    </div>
  );
}

export function NoteForm({ orderId, accountId }: { orderId: string; accountId: string }) {
  const [count, setCount] = useState(0);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (p, fd) => {
    const r = await addOrderNote(p, fd);
    if (r.ok) setCount((c) => c + 1);
    return r;
  }, {});
  return (
    <form action={action} className="grid gap-2" key={count}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="account_id" value={accountId} />
      <Textarea name="body" rows={2} placeholder="e.g. Client confirmed the delivery address in the group" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Add note</Button>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
      </div>
    </form>
  );
}
