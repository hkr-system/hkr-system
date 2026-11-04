"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Brand } from "@/lib/brands";
import { parseBaseFile, saveBaseList, type ParseState } from "@/app/(app)/price-lists/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { model: string; storage_gb: string; note: string; price: string; hasSku?: boolean };

// Base list (admin): upload the iPhonePrices xlsx or edit the current prices, check, save as a new version.
export function BaseEditor({ current, today, brand = "iphone" }: {
  current: { model: string; storage_gb: number; note: string | null; price_usd: number }[]; today: string; brand?: Brand;
}) {
  const samsung = brand === "samsung";
  const [rows, setRows] = useState<Row[]>(current.map((r) => ({ model: r.model, storage_gb: String(r.storage_gb), note: r.note ?? "", price: String(r.price_usd) })));
  const [source, setSource] = useState<string | null>(null);
  const [validFrom, setValidFrom] = useState(today);
  const [parsed, parseAction, parsing] = useActionState(async (p: ParseState, fd: FormData) => {
    const res = await parseBaseFile(p, fd);
    if (res.rows) {
      setRows(res.rows.map((r) => ({ model: r.model, storage_gb: String(r.storage_gb), note: r.note ?? "", price: String(r.price), hasSku: r.hasSku })));
      setSource(res.fileName ?? null);
    }
    return res;
  }, {});
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () => start(async () => {
    setErr(null);
    const res = await saveBaseList(JSON.stringify(rows.map((r) => ({ model: r.model, storage_gb: Number(r.storage_gb), note: r.note || null, price: Number(r.price) }))), source, validFrom, brand);
    if (res?.error) setErr(res.error);
  });
  const noSku = rows.filter((r) => r.hasSku === false).length;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Upload the {samsung ? "Samsung" : "iPhonePrices"} file</CardTitle>
          <CardDescription>Columns model · GB · USD, as you send it today. All colours share the price of their model and GB.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={parseAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="brand" value={brand} />
            <Input type="file" name="file" accept=".xlsx" className="max-w-xs" aria-label="Price list file" />
            <Button type="submit" size="sm" variant="outline" disabled={parsing}>{parsing ? "Reading…" : "Read file"}</Button>
            {parsed.error ? <span className="text-sm text-destructive">{parsed.error}</span> : null}
            {parsed.rows ? <span className="text-sm text-emerald-700" data-testid="parsed-count">{parsed.rows.length} prices read from {parsed.fileName}.</span> : null}
          </form>
          {parsed.problems?.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">{parsed.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Check and save as a new version</CardTitle>
          <CardDescription>
            Edit any cell if needed. The model name is how the system matches your SKUs (e.g. {samsung ? "“S24 Ultra”" : "“iPhone 15 Pro Max”"}); the note is printed after it{samsung ? " (model code, e.g. S928U)" : ""}.
            {noSku ? ` ${noSku} model(s) have no SKU yet: the price is kept, add the colours in Settings → SKUs before ordering them.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="hidden gap-2 text-xs text-muted-foreground sm:grid sm:grid-cols-[2fr_80px_1.4fr_110px_32px]">
            <span>Model</span><span>GB</span><span>Note</span><span>Base US$</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_80px_1.4fr_110px_32px] sm:items-center" data-testid="base-row">
              <div className="flex items-center gap-2">
                <Input value={r.model} onChange={(e) => set(i, { model: e.target.value })} aria-label="Model" />
                {r.hasSku === false ? <span className="shrink-0 text-xs text-amber-700" title="No SKU with this model and GB yet">no SKU</span> : null}
              </div>
              <Input value={r.storage_gb} onChange={(e) => set(i, { storage_gb: e.target.value })} inputMode="numeric" aria-label="GB" />
              <Input value={r.note} onChange={(e) => set(i, { note: e.target.value })} aria-label="Note" />
              <Input value={r.price} onChange={(e) => set(i, { price: e.target.value })} inputMode="decimal" aria-label="Base price" />
              <Button type="button" size="icon" variant="ghost" aria-label="Remove row" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { model: "", storage_gb: "", note: "", price: "" }])}><Plus className="size-3.5" /> Add row</Button>
            <div className="grid gap-1"><Label htmlFor="vf">Valid from</Label><Input id="vf" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="w-40" /></div>
            <Button type="button" size="sm" onClick={save} disabled={saving || !rows.length} data-testid="save-base">{saving ? "Saving…" : `Save ${rows.length} prices as the new ${samsung ? "Samsung " : ""}base`}</Button>
            {err ? <span className="text-sm text-destructive" role="alert">{err}</span> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
