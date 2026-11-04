import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { modelKey, rowLabel } from "@/lib/price-lists/models";
import { fmtDate, money2 } from "@/lib/price-lists/outputs";
import { pctText } from "@/lib/price-lists/labels";
import { loadRows } from "@/lib/price-lists/service";
import type { Signal } from "@/lib/price-lists/engine";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { ListStatusBadge } from "@/components/price-lists/badges";
import { GetPriceList } from "@/components/price-lists/get-list";
import { DraftActions, PercentForm, RemoveRowButton } from "@/components/price-lists/list-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriceTable, type PriceRow } from "@/components/price-lists/price-table";

export const metadata: Metadata = { title: "Price list" };

type Engine = {
  at?: string; demo?: boolean;
  rma?: { value: number; case: string; lines?: string[] };
  extra?: { value: number; case: string; score?: number | null; signals?: Signal[]; lines?: string[] };
  trimmed?: boolean;
  override?: { rma_c: number; extra_c: number; note?: string | null; at: string };
};

function Change({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return <span className="text-muted-foreground">new</span>;
  const d = Math.round((now - before) * 100) / 100;
  if (!d) return <span className="text-muted-foreground">=</span>;
  return <span className={d > 0 ? "text-hkr-action" : "text-emerald-700"}>{d > 0 ? "▲" : "▼"} {money2(Math.abs(d))}</span>;
}

export default async function PriceListPage({ params }: PageProps<"/price-lists/[id]">) {
  const access = await checkSection("price-lists");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const isAdmin = user.role === "admin";
  const canPrepare = isAdmin || user.role === "account_specialist";
  const { id } = await params;
  const db = await createClient();
  const { data: l } = await db.from("price_lists")
    .select("id, account_id, version, status, valid_from, valid_until, base_list_id, rma_c, extra_c, engine, source_file, approved_at, created_at, accounts(code, name)")
    .eq("id", id).maybeSingle();
  if (!l) notFound();
  const acc = l.accounts as unknown as { code: string; name: string } | null;
  const isBase = !l.account_id;
  const prevQ = db.from("price_lists").select("id, version").lt("version", l.version).neq("status", "draft")
    .order("version", { ascending: false }).limit(1);
  const [rows, { data: prev }, baseRows, { data: bm }] = await Promise.all([
    loadRows(db, id),
    (isBase ? prevQ.is("account_id", null) : prevQ.eq("account_id", l.account_id!)).maybeSingle(),
    isAdmin && l.base_list_id ? loadRows(db, l.base_list_id) : Promise.resolve([]),
    isAdmin && !isBase ? db.from("settings").select("value").eq("key", "base_margin_pct").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const [prevRows, { data: filed }] = await Promise.all([
    prev ? loadRows(db, prev.id) : Promise.resolve([]),
    db.from("files").select("id, file_name").eq("owner_table", "price_lists").eq("owner_id", id).order("file_name"),
  ]);
  const before = new Map(prevRows.map((r) => [modelKey(r.model, r.storage_gb), r.price_usd]));
  const beforeRow = new Map(prevRows.map((r) => [modelKey(r.model, r.storage_gb), r]));
  const baseOf = new Map(baseRows.map((r) => [modelKey(r.model, r.storage_gb), r.price_usd]));
  const e = (l.engine ?? {}) as Engine;
  const draft = l.status === "draft";
  const baseMarginPct = Number(bm?.value ?? 6) || 6;
  const priceRows: PriceRow[] = rows.map((r) => {
    const k = modelKey(r.model, r.storage_gb);
    const b = beforeRow.get(k);
    return {
      id: r.id, label: rowLabel(r), gb: r.storage_gb, base: isAdmin ? baseOf.get(k) ?? null : null,
      engine: r.engine_price_usd, price: r.price_usd, floor: r.floor_usd, adjusted: !!r.adjusted_at,
      rule: r.rule_increment_usd !== null && r.rule_price_usd !== null ? { increment: r.rule_increment_usd, price: r.rule_price_usd } : null,
      before: b ? { price: b.price_usd, adjusted: !!b.adjusted_at } : null,
    };
  });

  return (
    <>
      <PageHeader
        title={isBase ? `Base list v${l.version}` : `${acc?.code} · price list v${l.version}`}
        description={isBase ? "Admin only. Client lists are built from the approved base." : `${acc?.name} · valid ${fmtDate(l.valid_from)} – ${l.valid_until ? fmtDate(l.valid_until) : "—"}`}>
        <div className="flex items-center gap-3">
          <ListStatusBadge status={l.status} />
          {l.account_id ? <Link href={`/accounts/${l.account_id}?tab=price-lists`} className="text-sm text-hkr-accent hover:underline">Account →</Link> : null}
          <Link href="/price-lists" className="text-sm text-hkr-accent hover:underline">← Price lists</Link>
        </div>
      </PageHeader>

      <div className="grid gap-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <GetPriceList listId={l.id} />
            {draft && canPrepare && !isBase ? <DraftActions listId={l.id} isAdmin={isAdmin} /> : null}
            {l.approved_at ? (
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="filed">
                Approved {formatDateTime(l.approved_at, user.timezone)}
                {(filed ?? []).length ? <>· filed in the account:</> : null}
                {(filed ?? []).map((f) => <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="text-hkr-accent hover:underline">{f.file_name}</a>)}
              </span>
            ) : null}
          </CardContent>
        </Card>

        {!isBase ? (
          <Card data-testid="engine-card">
            <CardHeader>
              <CardTitle className="text-base">How the engine decided</CardTitle>
              <CardDescription>List = Base × (1 + RMA_c + Extra_c) · Floor = Base × (1 + RMA_c). Below the floor, the Sales Director decides (SOP 5.5).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1 text-sm">
                <p className="font-medium">RMA amortization (RMA_c): {pctText(l.rma_c)}</p>
                {(e.rma?.lines ?? []).map((t) => <p key={t} className="text-muted-foreground">{t}</p>)}
                {e.demo ? <p className="text-muted-foreground">Demo list (seeded).</p> : null}
              </div>
              <div className="grid gap-1 text-sm">
                <p className="font-medium">Extra margin (Extra_c): {pctText(l.extra_c)}</p>
                {(e.extra?.signals ?? []).length && e.extra?.case === "engine" ? (
                  <ul className="list-disc pl-5 text-muted-foreground">{e.extra!.signals!.map((s) => <li key={s.key}><span className="text-foreground">{s.label}:</span> {s.text}</li>)}</ul>
                ) : null}
                {(e.extra?.lines ?? []).map((t) => <p key={t} className="text-muted-foreground">{t}</p>)}
                {e.trimmed ? <p className="text-amber-800">Trimmed so RMA_c + Extra_c stays within the combined maximum.</p> : null}
              </div>
              {e.override ? (
                <p className="text-sm text-amber-800 md:col-span-2">Changed by the admin to RMA_c {pctText(e.override.rma_c)} · Extra_c {pctText(e.override.extra_c)}{e.override.note ? ` — ${e.override.note}` : ""} (engine suggested {pctText(e.rma?.value)} · {pctText(e.extra?.value)}).</p>
              ) : null}
              {draft && isAdmin ? <div className="md:col-span-2"><PercentForm listId={l.id} rma={Number(l.rma_c)} extra={Number(l.extra_c)} /></div> : null}
            </CardContent>
          </Card>
        ) : null}

        {!isBase ? (
          <Card data-testid="prices-card">
            <CardHeader>
              <CardTitle className="text-base">{rows.length} prices</CardTitle>
              <CardDescription>
                One price per model and GB, for every colour. Engine = Base × (1 + RMA_c + Extra_c); each client can get its own
                price per row.{draft && canPrepare ? " ✏️ Edit to adjust prices or remove the models this client should not receive." : ""}
                {prev ? ` "Before" = version ${prev.version}.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PriceTable listId={l.id} rows={priceRows} rmaPct={Number(l.rma_c)} baseMarginPct={baseMarginPct}
                isAdmin={isAdmin} editable={draft && canPrepare} prevVersion={prev?.version ?? null} />
            </CardContent>
          </Card>
        ) : (
        <Card>
            <CardHeader>
              <CardTitle className="text-base">{rows.length} prices</CardTitle>
              <CardDescription>
                One price per model and GB, for every colour.{prev ? ` Change vs version ${prev.version}.` : ""}
                {draft && canPrepare && !isBase ? " Remove the models this client should not receive." : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead><TableHead className="text-right">GB</TableHead>
                    {isAdmin && !isBase ? <TableHead className="text-right">Base US$</TableHead> : null}
                    <TableHead className="text-right">{isBase ? "Base US$" : "List US$"}</TableHead>
                    {!isBase ? <TableHead className="text-right">Floor US$</TableHead> : null}
                    <TableHead className="text-right">Change</TableHead>
                    {draft && canPrepare && !isBase ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} data-testid="pl-row">
                      <TableCell>{rowLabel(r)}</TableCell>
                      <TableCell className="text-right">{r.storage_gb}</TableCell>
                      {isAdmin && !isBase ? <TableCell className="text-right text-muted-foreground">{baseOf.has(modelKey(r.model, r.storage_gb)) ? money2(baseOf.get(modelKey(r.model, r.storage_gb))!) : "—"}</TableCell> : null}
                      <TableCell className="text-right font-medium">{money2(r.price_usd)}</TableCell>
                      {!isBase ? <TableCell className="text-right">{r.floor_usd === null ? "—" : money2(r.floor_usd)}</TableCell> : null}
                      <TableCell className="text-right text-sm">{prev ? <Change now={r.price_usd} before={before.get(modelKey(r.model, r.storage_gb))} /> : "—"}</TableCell>
                      {draft && canPrepare && !isBase ? <TableCell className="w-10"><RemoveRowButton rowId={r.id} listId={l.id} /></TableCell> : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
