"use client";

import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { previewImport, runImport, type CommitResult, type PreviewResult } from "@/app/(app)/leads/import/actions";

// Lead fields a column can be mapped to, with header names we recognise automatically.
const TARGETS = [
  { key: "company", label: "Company *", guess: ["company", "company name", "empresa", "organization", "business", "bedrijf", "name"] },
  { key: "contact_name", label: "Contact name", guess: ["contact", "contact name", "full name", "nombre", "person"] },
  { key: "title", label: "Job title", guess: ["title", "job title", "position", "cargo"] },
  { key: "email", label: "Email", guess: ["email", "e-mail", "mail", "correo"] },
  { key: "phone", label: "Phone / WhatsApp", guess: ["phone", "whatsapp", "mobile", "telefono", "teléfono", "tel", "wa"] },
  { key: "country", label: "Country", guess: ["country", "pais", "país", "land"] },
  { key: "city", label: "City", guess: ["city", "ciudad", "stad", "town"] },
  { key: "website", label: "Website", guess: ["website", "web", "url", "site"] },
  { key: "linkedin_url", label: "LinkedIn URL", guess: ["linkedin", "linkedin url", "profile"] },
  { key: "business_type", label: "Business type", guess: ["business type", "type", "category"] },
  { key: "volume_units_month", label: "Volume (units/month)", guess: ["volume", "units", "units/month"] },
  { key: "notes", label: "Notes", guess: ["notes", "note", "comments", "notas"] },
] as const;

type Sheet = { headers: string[]; rows: string[][] };

const STATUS_STYLE: Record<string, string> = {
  new: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  merge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  duplicate: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  invalid: "bg-destructive/10 text-destructive",
};

async function readFile(file: File): Promise<Sheet> {
  let table: string[][];
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    table = data.map((r) => r.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
  } else {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    table = parsed.data;
  }
  const [headers = [], ...rows] = table;
  return { headers: headers.map((h) => String(h).trim()), rows: rows.filter((r) => r.some((c) => String(c).trim())) };
}

function guessMapping(headers: string[]) {
  const used = new Set<number>();
  const map: Record<string, string> = {};
  for (const t of TARGETS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && (t.guess as readonly string[]).includes(h.toLowerCase().trim()));
    if (idx >= 0) { map[t.key] = String(idx); used.add(idx); }
  }
  return map;
}

export function Importer({ suggestions }: { suggestions: string[] }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const rows = useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.map((r) => {
      const o: Record<string, string> = {};
      for (const [key, col] of Object.entries(mapping)) if (col !== "") o[key] = String(r[Number(col)] ?? "");
      return o;
    });
  }, [sheet, mapping]);

  async function onFile(file: File | undefined) {
    setPreview(null); setResult(null); setError(null);
    if (!file) return;
    try {
      const s = await readFile(file);
      if (!s.headers.length) throw new Error("The first row must contain the column names.");
      setSheet(s);
      setFileName(file.name);
      setMapping(guessMapping(s.headers));
      if (!source) setSource(file.name.replace(/\.(csv|xlsx)$/i, ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file. Use .csv or .xlsx.");
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="file">1. File (.xlsx or .csv, first row = column names)</Label>
          <Input id="file" type="file" accept=".csv,.xlsx" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="source">2. Source name (saved on every lead)</Label>
          <Input id="source" list="source-suggestions" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Leads NL" />
          <datalist id="source-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {sheet ? (
        <div className="grid gap-3">
          <Label>3. Match the columns ({sheet.rows.length} rows in “{fileName}”)</Label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TARGETS.map((t) => (
              <div key={t.key} className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t.label}</span>
                <NativeSelect value={mapping[t.key] ?? ""} aria-label={t.label}
                  onChange={(e) => { setMapping((m) => ({ ...m, [t.key]: e.target.value })); setPreview(null); }}>
                  <option value="">— not in file —</option>
                  {sheet.headers.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>)}
                </NativeSelect>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending || !mapping.company}
              onClick={() => start(async () => { setResult(null); const r = await previewImport(rows, source); setPreview(r); setError(r.error ?? null); })}>
              {pending && !preview ? "Checking…" : "4. Preview"}
            </Button>
            {!mapping.company ? <span className="self-center text-xs text-muted-foreground">Pick the Company column first.</span> : null}
          </div>
        </div>
      ) : null}

      {preview?.counts ? (
        <div className="grid gap-3" data-testid="import-preview">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge className={STATUS_STYLE.new}>{preview.counts.new} new</Badge>
            <Badge className={STATUS_STYLE.merge}>{preview.counts.merge} already in the system (fill empty fields)</Badge>
            <Badge className={STATUS_STYLE.duplicate}>{preview.counts.duplicate} repeated in the file (skipped)</Badge>
            <Badge className={STATUS_STYLE.invalid}>{preview.counts.invalid} without company (skipped)</Badge>
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Row</TableHead><TableHead>Result</TableHead><TableHead>Company</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Notes</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows!.map((r) => (
                  <TableRow key={r.row}>
                    <TableCell className="tabular-nums">{r.row}</TableCell>
                    <TableCell><span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span></TableCell>
                    <TableCell>{r.company || "—"}{r.existingCompany && r.existingCompany !== r.company ? <span className="block text-xs text-muted-foreground">= {r.existingCompany}</span> : null}</TableCell>
                    <TableCell>{r.email ?? "—"}</TableCell>
                    <TableCell>{r.phone ?? "—"}</TableCell>
                    <TableCell className="max-w-64 text-xs whitespace-normal text-muted-foreground">{r.problems.join(" ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">Rows with a bad email or phone are imported without that value. New leads start in stage New with no owner.</p>
          <div>
            <Button disabled={pending || (preview.counts.new + preview.counts.merge === 0)}
              onClick={() => start(async () => { const r = await runImport(rows, source, fileName); setResult(r); setError(r.error ?? null); if (!r.error) { setPreview(null); setSheet(null); } })}>
              {pending ? "Importing…" : `5. Import ${preview.counts.new} new and update ${preview.counts.merge}`}
            </Button>
          </div>
        </div>
      ) : null}

      {result && !result.error ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" data-testid="import-result">
          Done: {result.created} created, {result.merged} existing leads updated, {result.skipped} skipped.
          {result.failures?.length ? ` Some rows failed: ${result.failures.join("; ")}` : ""}
        </p>
      ) : null}
    </div>
  );
}
