"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet } from "lucide-react";
import { readInvoiceExcel, type ReadInvoiceResult } from "@/app/(app)/orders/import-actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { emptyLine, type Line } from "./order-lines";
import { OrderForm, type ImportInfo, type OrderValues } from "./order-form";

type FormProps = Omit<React.ComponentProps<typeof OrderForm>, "values" | "importInfo">;

// Step 1: client + .xlsx → the server reads it. Step 2: the normal order form, filled in, with the total check.
export function InvoiceImport(props: FormProps) {
  const [accountId, setAccountId] = useState(props.accounts.length === 1 ? props.accounts[0].id : "");
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<(ReadInvoiceResult & { file: File; accountId: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const read = () => {
    if (!file || !accountId) return;
    setError(null);
    const fd = new FormData(); fd.set("file", file); fd.set("account_id", accountId);
    start(async () => {
      const r = await readInvoiceExcel(fd);
      if (r.error || !r.invoice || !r.plan) { setError(r.error ?? "The invoice could not be read."); setRes(null); return; }
      setRes({ ...r, file, accountId });
    });
  };

  if (res?.invoice && res.plan) {
    const { invoice: inv, plan } = res;
    const lines: Line[] = plan.lines.map((p) => ({
      ...emptyLine(p.ce), model: p.model, storage_gb: p.storage_gb, qty: String(p.qty), unit_price: String(p.unit),
      mixed: p.mixed, colors: Object.fromEntries(p.colors.map((c) => [c.color, String(c.qty)])), ce: p.ce, battery: p.battery, sim: p.sim,
      battery_unit: plan.batteryLineSeparate && p.battery === "new" ? String(plan.batteryUnit) : "",
    }));
    const values: OrderValues = {
      account_id: res.accountId, order_date: inv.orderDate ?? inv.invoiceDate ?? undefined, payment_method: plan.paymentMethod,
      freight_mode: plan.freight.mode, freight_unit_usd: plan.freight.unit, freight_usd: plan.freight.total,
      customs_mode: plan.customs.mode, customs_unit_usd: plan.customs.unit, customs_usd: plan.customs.total,
      charges: plan.charges.map((c) => ({ description: c.description, qty: c.qty === null ? "" : String(c.qty), unit: c.unit === null ? "" : String(c.unit), amount: String(c.amount) })),
      invoice_format: { battery_line_separate: plan.batteryLineSeparate, show_ce_text: plan.ce, plain_lines: false, show_note: false },
      intermediary_id: res.intermediaryId, address_id: res.addressId ?? (res.shipTo ? "new" : undefined),
      ship_to: res.shipTo, new_address_label: res.shipTo?.name, lines,
      hk_invoice_no: inv.number,
      notes: `Imported from the Excel invoice ${inv.number ?? res.file.name}.`,
    };
    const notes = [
      ...(res.notes ?? []),
      ...inv.products.flatMap((p, i) => p.problems.map((x) => `Line ${i + 1} (${p.model}${p.storage_gb ? ` ${p.storage_gb}GB` : ""}): ${x}`)),
      ...inv.problems,
    ];
    const info: ImportInfo = { file: res.file, number: inv.number, excelTotal: inv.total, canClosePaid: props.isAdmin, notes };
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="size-4" aria-hidden /> {res.file.name}: {inv.products.length} product line{inv.products.length === 1 ? "" : "s"} read.
          <Button type="button" variant="ghost" size="sm" onClick={() => setRes(null)} data-testid="import-again">Choose another file</Button>
        </div>
        <OrderForm key={`${res.file.name}-${res.file.lastModified}`} {...props} values={values} importInfo={info} />
      </div>
    );
  }

  return (
    <Card className="max-w-2xl" data-testid="import-start">
      <CardHeader>
        <CardTitle className="text-base">1. Client and invoice file</CardTitle>
        <CardDescription>The end client does not always appear on the invoice (clearance companies, intermediaries): choose it here. The file must be an HKR invoice in Excel (.xlsx).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Client *</Label>
          <NativeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)} data-testid="import-account">
            <option value="">Choose…</option>
            {props.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inv-file">Invoice (.xlsx) *</Label>
          <input id="inv-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" data-testid="import-file" />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={read} disabled={pending || !file || !accountId} data-testid="import-read">{pending ? "Reading…" : "Read the invoice"}</Button>
          {error ? <p className="text-sm text-destructive" role="alert" data-testid="import-error">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
