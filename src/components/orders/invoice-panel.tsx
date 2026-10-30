"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FileSpreadsheet } from "lucide-react";
import {
  approveInvoice, createInvoiceDraft, deleteInvoiceDraft, markInvoiceSent, refreshInvoiceFromOrder, reopenInvoice, saveInvoiceDraft,
  type InvoiceState,
} from "@/app/(app)/orders/invoice-actions";
import { money } from "@/lib/orders/constants";
import type { InvoiceLine } from "@/lib/documents/invoice-lines";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type InvoiceRow = {
  id: string; number: string; status: "draft" | "approved" | "sent" | "void"; version: number; invoice_date: string;
  consignee: string; ship_to: string; notify: { contact?: string; address?: string; phone?: string };
  shipment: { country?: string; reference?: string; awb?: string; airport?: string };
  lines: InvoiceLine[]; total_usd: number; file_pdf_id: string | null; file_xlsx_id: string | null;
};

const STATUS_LABEL = { draft: "Draft", approved: "Approved", sent: "Sent", void: "Void" } as const;
const STATUS_STYLE = { draft: "bg-amber-50 text-amber-800", approved: "bg-sky-50 text-sky-800", sent: "bg-emerald-50 text-emerald-800", void: "bg-muted" } as const;

export function InvoicePanel({ orderId, invoice, orderTotal, role, issuerReady }: {
  orderId: string; invoice: InvoiceRow | null; orderTotal: number; role: string; issuerReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<InvoiceState>({});
  const [state, saveAction, saving] = useActionState(saveInvoiceDraft, {});
  const isAdmin = role === "admin";
  const canPrepare = isAdmin || role === "account_specialist";
  const run = (fn: () => Promise<InvoiceState>) => start(async () => { setMsg({}); const r = await fn(); setMsg(r); if (!r.error) router.refresh(); });
  const feedback = msg.error || state.error ? <p role="alert" className="text-sm text-destructive">{msg.error || state.error}</p>
    : msg.message || state.message ? <p className="text-sm text-emerald-700" data-testid="invoice-message">{msg.message || state.message}</p> : null;

  if (!invoice) {
    return (
      <div className="grid gap-2" data-testid="invoice-panel">
        <p className="text-sm text-muted-foreground">No invoice yet. The draft takes the lines, totals and addresses from this order and the account.</p>
        {!issuerReady ? <p className="text-xs text-amber-700">The company details for the invoice header are not filled yet (Settings → Invoices, admin).</p> : null}
        {canPrepare ? <div><Button size="sm" disabled={pending} onClick={() => run(() => createInvoiceDraft(orderId))}>{pending ? "Creating…" : "Create invoice draft"}</Button></div> : null}
        {feedback}
      </div>
    );
  }

  const differs = Math.abs(Number(invoice.total_usd) - orderTotal) > 0.004;
  const draft = invoice.status === "draft";
  const editable = draft && canPrepare;

  return (
    <div className="grid gap-3" data-testid="invoice-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium" data-testid="invoice-number">No. {invoice.number}</span>
        <Badge className={STATUS_STYLE[invoice.status]} data-testid="invoice-status">{STATUS_LABEL[invoice.status]}</Badge>
        {invoice.version > 1 ? <span className="text-xs text-muted-foreground">version {invoice.version}</span> : null}
        <span className="ml-auto flex gap-1">
          <Button asChild size="sm" variant="outline"><a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer"><FileDown className="size-4" /> PDF</a></Button>
          <Button asChild size="sm" variant="outline"><a href={`/api/invoices/${invoice.id}/xlsx`}><FileSpreadsheet className="size-4" /> Excel</a></Button>
        </span>
      </div>
      {!issuerReady ? <p className="text-xs text-amber-700">The company details for the header are not filled yet (Settings → Invoices, admin).</p> : null}
      {differs ? (
        <p className="text-sm text-amber-700" data-testid="invoice-differs">The order changed: invoice {money(invoice.total_usd)} vs order {money(orderTotal)}.{draft ? " Take the lines again from the order." : " An admin reopens it as a new version."}</p>
      ) : null}

      {editable ? (
        <form action={saveAction} className="grid gap-3">
          <input type="hidden" name="id" value={invoice.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label htmlFor="inv-date">Invoice date</Label><Input id="inv-date" type="date" name="invoice_date" defaultValue={invoice.invoice_date} required /></div>
            <div className="grid gap-1.5"><Label>Country of consignation</Label><Input name="ship_country" defaultValue={invoice.shipment.country ?? ""} /></div>
            <div className="grid gap-1.5"><Label>Air Way Bill</Label><Input name="ship_awb" defaultValue={invoice.shipment.awb ?? ""} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Ultimate consignee (one line each)</Label><Textarea name="consignee" rows={5} defaultValue={invoice.consignee} data-testid="inv-consignee" /></div>
            <div className="grid gap-1.5"><Label>Ship to (one line each)</Label><Textarea name="ship_to" rows={5} defaultValue={invoice.ship_to} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label>Notify: contact</Label><Input name="notify_contact" defaultValue={invoice.notify.contact ?? ""} /></div>
            <div className="grid gap-1.5"><Label>Notify: address</Label><Input name="notify_address" defaultValue={invoice.notify.address ?? ""} /></div>
            <div className="grid gap-1.5"><Label>Notify: phone / email</Label><Input name="notify_phone" defaultValue={invoice.notify.phone ?? ""} /></div>
          </div>
          <input type="hidden" name="ship_reference" value={invoice.shipment.reference ?? "N/A"} />
          <input type="hidden" name="ship_airport" value={invoice.shipment.airport ?? ""} />
          <div className="grid gap-2">
            <Label>Lines (you can adjust the text, e.g. “Physical SIM”, “91%+ BH”, “50% Black + Mixed Colors”; amounts come from the order)</Label>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm" data-tabular>
                <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-left font-normal">Description</th><th className="p-2 text-right font-normal">Qty</th><th className="p-2 text-right font-normal">Unit</th><th className="p-2 text-right font-normal">Total</th></tr></thead>
                <tbody>
                  {invoice.lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1.5"><Input name={`line_${i}`} defaultValue={l.description} className="min-w-72" aria-label={`Line ${i + 1} description`} /></td>
                      <td className="p-2 text-right">{l.qty ?? ""}</td>
                      <td className="p-2 text-right">{l.unit_price != null ? money(l.unit_price) : ""}</td>
                      <td className="p-2 text-right">{money(l.total)}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold"><td className="p-2 text-right" colSpan={3}>Total C.F.R. USD</td><td className="p-2 text-right" data-testid="invoice-total">{money(invoice.total_usd)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="outline" disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => refreshInvoiceFromOrder(invoice.id))}>Take lines again from the order</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => refreshInvoiceFromOrder(invoice.id, true))}>…and addresses</Button>
            {isAdmin ? <Button type="button" size="sm" disabled={pending || differs} onClick={() => run(() => approveInvoice(invoice.id))}>Approve</Button> : <span className="self-center text-xs text-muted-foreground">An admin approves it.</span>}
            {isAdmin ? <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => run(() => deleteInvoiceDraft(invoice.id))}>Delete draft</Button> : null}
          </div>
        </form>
      ) : (
        <div className="grid gap-2">
          <ul className="grid gap-0.5 text-sm" data-tabular>
            {invoice.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3"><span className="min-w-0">{l.description}{l.qty != null ? <span className="text-muted-foreground"> · {l.qty} × {money(l.unit_price)}</span> : null}</span><span className="shrink-0">{money(l.total)}</span></li>
            ))}
            <li className="flex justify-between border-t pt-1 font-semibold"><span>Total C.F.R. USD</span><span data-testid="invoice-total">{money(invoice.total_usd)}</span></li>
          </ul>
          <div className="flex flex-wrap gap-2">
            {invoice.status === "approved" && canPrepare ? <Button size="sm" disabled={pending} onClick={() => run(() => markInvoiceSent(invoice.id))}>{pending ? "Saving…" : "Mark as sent to the client"}</Button> : null}
            {invoice.status === "sent" && invoice.file_pdf_id ? <a className="self-center text-sm underline" href={`/api/files/${invoice.file_pdf_id}`} target="_blank" rel="noreferrer">Sent PDF</a> : null}
            {isAdmin && ["approved", "sent"].includes(invoice.status) ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reopenInvoice(invoice.id))}>Reopen as new version</Button> : null}
          </div>
          {invoice.status === "approved" ? <p className="text-xs text-muted-foreground">“Mark as sent” saves the PDF and Excel in the order documents; the client sees them in the portal.</p> : null}
        </div>
      )}
      {feedback}
    </div>
  );
}
