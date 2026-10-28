"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { deleteCreditNote, regenerateCreditNoteFiles, saveCreditNote, setCreditNoteStatus } from "@/app/(app)/rmas/credit-notes/actions";
import { APPLIED_TO_LABEL, type CreditAppliedTo, type CreditNoteStatus } from "@/lib/rmas/constants";
import { money } from "@/lib/orders/constants";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Line = { key: number; description: string; qty: string; unit_price: string };
export type CnEditorValue = {
  id: string | null; accountId: string; rmaId: string | null; orderId: string | null; invoiceNo: string; inFavorOf: string;
  currency: "USD" | "EUR"; reason: string; appliedTo: CreditAppliedTo; notes: string;
  lines: { description: string; qty: number; unit_price: number }[];
};

export function CreditNoteEditor({ value, accounts, orders, editable }: {
  value: CnEditorValue; accounts: { id: string; code: string; name: string; legal_name: string | null }[];
  orders: { id: string; account_id: string; number: string; hk_invoice_no: string | null; total_usd: number }[]; editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(value);
  const [lines, setLines] = useState<Line[]>(value.lines.length ? value.lines.map((l, i) => ({ key: i, description: l.description, qty: String(l.qty), unit_price: String(l.unit_price) })) : [{ key: 0, description: "", qty: "1", unit_price: "" }]);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const total = lines.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
  const accountOrders = orders.filter((o) => o.account_id === v.accountId);
  const cap = (accountOrders.find((o) => o.id === v.orderId)?.total_usd ?? 0) * 0.01;
  const setLine = (k: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const save = () => start(async () => {
    setMsg({});
    const r = await saveCreditNote({ ...v, lines: lines.map((l) => ({ description: l.description, qty: Number(l.qty), unit_price: Number(l.unit_price) })) });
    if (r.error) { setMsg({ error: r.error }); return; }
    setMsg({ ok: r.message });
    if (!v.id && r.id) router.push(`/rmas/credit-notes/${r.id}`); else router.refresh();
  });

  return (
    <div className="grid gap-4" data-testid="cn-editor">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5"><Label>Account</Label>
          <NativeSelect value={v.accountId} disabled={!editable || Boolean(v.id)} onChange={(e) => {
            const a = accounts.find((x) => x.id === e.target.value);
            setV({ ...v, accountId: e.target.value, orderId: null, invoiceNo: "", inFavorOf: a?.legal_name ?? a?.name ?? "" });
          }}>
            <option value="">Choose…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>Invoice it refers to</Label>
          <NativeSelect value={v.orderId ?? ""} disabled={!editable} onChange={(e) => {
            const o = accountOrders.find((x) => x.id === e.target.value);
            setV({ ...v, orderId: e.target.value || null, invoiceNo: o?.hk_invoice_no ?? v.invoiceNo });
          }}>
            <option value="">—</option>
            {accountOrders.map((o) => <option key={o.id} value={o.id}>{o.number} · invoice {o.hk_invoice_no ?? "—"}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>Invoice number</Label><Input value={v.invoiceNo} disabled={!editable} onChange={(e) => setV({ ...v, invoiceNo: e.target.value })} /></div>
        <div className="grid gap-1.5 sm:col-span-2"><Label>In favor of (legal entity exactly as on the invoice)</Label><Input value={v.inFavorOf} disabled={!editable} onChange={(e) => setV({ ...v, inFavorOf: e.target.value })} /></div>
        <div className="grid gap-1.5"><Label>Currency</Label>
          <NativeSelect value={v.currency} disabled={!editable} onChange={(e) => setV({ ...v, currency: e.target.value as "USD" | "EUR" })}><option>USD</option><option>EUR</option></NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>Applied to (as agreed by the SD)</Label>
          <NativeSelect value={v.appliedTo} disabled={!editable} onChange={(e) => setV({ ...v, appliedTo: e.target.value as CreditAppliedTo })}>
            {Object.entries(APPLIED_TO_LABEL.en).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5 sm:col-span-2"><Label>Reason</Label><Input value={v.reason} disabled={!editable} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="RMA credit / units not shipped / compensation" /></div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Lines — one per concept, quantity × unit price</p>
        {lines.map((l, i) => (
          <div key={l.key} className="grid gap-2 sm:grid-cols-[3fr_1fr_1fr_1fr_auto]" data-testid="cn-line">
            <Input value={l.description} disabled={!editable} placeholder={`Line ${i + 1}: e.g. Repair credit — iPhone 14 128GB · IMEI …`} onChange={(e) => setLine(l.key, { description: e.target.value })} />
            <Input value={l.qty} disabled={!editable} inputMode="decimal" aria-label="Quantity" onChange={(e) => setLine(l.key, { qty: e.target.value })} />
            <Input value={l.unit_price} disabled={!editable} inputMode="decimal" aria-label="Unit price" onChange={(e) => setLine(l.key, { unit_price: e.target.value })} />
            <span className="self-center text-right text-sm" data-tabular>{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0), v.currency)}</span>
            {editable ? <Button size="icon-sm" variant="ghost" aria-label="Remove line" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls)}><Trash2 className="size-3.5" /></Button> : <span />}
          </div>
        ))}
        {editable ? <div><Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, description: "", qty: "1", unit_price: "" }])}><Plus className="size-3.5" /> Add a line</Button></div> : null}
        <div className="flex justify-end gap-6 text-sm" data-tabular>
          {cap > 0 ? <span className={total > cap ? "font-medium text-hkr-action" : "text-muted-foreground"} data-testid="cn-cap">Cap (invoice × 1 %): {money(cap)}{total > cap ? " — above the cap: the SD decides" : ""}</span> : null}
          <span className="font-semibold">Total C.F.R.: {money(total, v.currency)}</span>
        </div>
      </div>

      {editable ? (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending || !v.accountId} data-testid="save-cn">{pending ? "Saving…" : v.id ? "Save draft" : "Create draft"}</Button>
          {msg.error ? <span className="text-sm text-destructive" role="alert">{msg.error}</span> : null}
          {msg.ok ? <span className="text-sm text-emerald-700">{msg.ok}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function CnStatusControls({ id, status, isAdmin, hasFiles }: { id: string; status: CreditNoteStatus; isAdmin: boolean; hasFiles: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [inv, setInv] = useState("");
  const run = (s: CreditNoteStatus) => start(async () => {
    setMsg({});
    const r = await setCreditNoteStatus(id, s, inv);
    setMsg(r.error ? { error: r.error } : { ok: r.message });
    router.refresh();
  });
  return (
    <div className="grid gap-2" data-testid="cn-status-controls">
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" && isAdmin ? <Button size="sm" disabled={pending} onClick={() => run("approved")} data-testid="cn-approve">Approve (Sales Director)</Button> : null}
        {status === "draft" && !isAdmin ? <span className="text-xs text-muted-foreground">Send the PDF to the Sales Director; an admin approves it here.</span> : null}
        {status === "approved" ? <Button size="sm" disabled={pending} onClick={() => run("issued")} data-testid="cn-issue">Issue (save PDF + xlsx, show in the portal)</Button> : null}
        {status === "issued" ? (
          <>
            <Input value={inv} onChange={(e) => setInv(e.target.value)} placeholder="Applied on invoice #" className="w-48" aria-label="Applied on invoice number" />
            <Button size="sm" disabled={pending} onClick={() => run("applied")} data-testid="cn-apply">Mark applied</Button>
          </>
        ) : null}
        {["issued", "applied"].includes(status) && !hasFiles ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await regenerateCreditNoteFiles(id); setMsg(r.error ? { error: r.error } : { ok: r.message }); router.refresh(); })}>Save the files again</Button>
        ) : null}
        {isAdmin && !["cancelled", "draft"].includes(status) ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Cancel this credit note?")) run("cancelled"); }}>Cancel</Button> : null}
        {status === "draft" ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Delete this draft?")) start(async () => { const r = await deleteCreditNote(id); if (r.error) setMsg({ error: r.error }); else router.push("/rmas/credit-notes"); }); }}>Delete draft</Button> : null}
      </div>
      {msg.error ? <p className="text-sm text-destructive" role="alert">{msg.error}</p> : null}
      {msg.ok ? <p className="text-sm text-emerald-700" data-testid="cn-message">{msg.ok}</p> : null}
    </div>
  );
}
