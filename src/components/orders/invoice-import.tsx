"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { readInvoiceExcel, type ReadInvoiceResult } from "@/app/(app)/orders/import-actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [drag, setDrag] = useState(false);

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

  const pick = (f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { setFile(null); setError("Choose an Excel file ending in .xlsx (save .xls or PDF invoices as .xlsx first)."); return; }
    setFile(f);
  };
  const missing = !accountId && !file ? "Choose the client and the Excel file first." : !accountId ? "Choose the client first." : !file ? "Choose the Excel file first." : null;

  return (
    <div className="grid max-w-2xl gap-4" data-testid="import-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
          <CardDescription>Turn an invoice you already made in Excel into an order, without typing it again.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 text-sm sm:grid-cols-3" data-testid="import-howto">
            {[
              ["Choose the client", "The company that buys. On invoices via a clearance company or intermediary its name is not on the invoice."],
              ["Add the Excel invoice", "Click “Choose Excel file” or drag the .xlsx into the box, then “Read the invoice”."],
              ["Check and create", "The order form opens filled in. Check the total (green = same as the Excel), pick the status, then “Create order”."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-hkr-ink/30 text-xs font-semibold text-hkr-ink">{i + 1}</span>
                <span><span className="font-medium text-foreground">{t}</span><br /><span className="text-muted-foreground">{d}</span></span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">Nothing is saved until you press “Create order”.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Client</CardTitle>
        </CardHeader>
        <CardContent>
          <NativeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)} data-testid="import-account" aria-label="Client">
            <option value="">Choose the client…</option>
            {props.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </NativeSelect>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Excel invoice (.xlsx)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <label htmlFor="inv-file" data-testid="import-drop"
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${drag ? "border-hkr-accent bg-hkr-accent-tint" : "border-border hover:bg-muted/50"}`}>
            <FileSpreadsheet className="size-8 text-hkr-ink" aria-hidden />
            {file ? (
              <>
                <span className="text-sm font-medium text-foreground" data-testid="import-file-name">{file.name}</span>
                <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB · click to choose another file</span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-xs">
                  <Upload className="size-4" aria-hidden /> Choose Excel file
                </span>
                <span className="text-xs text-muted-foreground">or drag the .xlsx here</span>
              </>
            )}
            <input id="inv-file" type="file" className="sr-only" data-testid="import-file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={read} disabled={pending || !file || !accountId} data-testid="import-read">{pending ? "Reading…" : "Read the invoice"}</Button>
            {missing && !error ? <span className="text-sm text-muted-foreground" data-testid="import-missing">{missing}</span> : null}
            {error ? <p className="text-sm text-destructive" role="alert" data-testid="import-error">{error}</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
