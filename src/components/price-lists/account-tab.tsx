import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { compareRows, modelKey, rowLabel } from "@/lib/price-lists/models";
import { fmtDate, money2 } from "@/lib/price-lists/outputs";
import { isDue, pctText } from "@/lib/price-lists/labels";
import { DueBadge, ListStatusBadge } from "./badges";
import { GetPriceList } from "./get-list";
import { PrepareListButton } from "./list-actions";
import { RulesEditor } from "./rules-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Account → Price lists tab: current list, versions and the change per SKU across the last 4 versions (brief item 8).
export async function AccountPriceLists({ accountId, canPrepare, today }: { accountId: string; canPrepare: boolean; today: string }) {
  const db = await createClient();
  const { data: lists } = await db.from("price_lists").select("id, version, status, valid_from, valid_until, rma_c, extra_c, approved_at")
    .eq("account_id", accountId).order("version", { ascending: false });
  const all = lists ?? [];
  const current = all.find((l) => l.status === "approved");
  const draft = all.find((l) => l.status === "draft");
  const history = all.filter((l) => l.status !== "draft").slice(0, 4).reverse();
  const { data: rows } = history.length
    ? await db.from("price_list_rows").select("price_list_id, model, storage_gb, note, price_usd").in("price_list_id", history.map((h) => h.id))
    : { data: [] };
  const grid = new Map<string, { model: string; storage_gb: number; note: string | null; prices: Map<string, number> }>();
  for (const r of rows ?? []) {
    const k = modelKey(r.model, r.storage_gb);
    const g = grid.get(k) ?? { model: r.model, storage_gb: r.storage_gb, note: r.note, prices: new Map() };
    g.prices.set(r.price_list_id, Number(r.price_usd));
    grid.set(k, g);
  }
  const skus = [...grid.values()].sort(compareRows);
  // client price rules (admin + specialist): fixed US$ over the base, models offered = the latest list of this client
  const latest = draft ?? current;
  const [{ data: rules }, { data: latestRows }] = canPrepare
    ? await Promise.all([
        db.rpc("price_rules_for", { p_account: accountId }),
        latest ? db.from("price_list_rows").select("model, storage_gb, note, sort_order").eq("price_list_id", latest.id) : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }];
  const choices = [...(latestRows ?? [])].sort(compareRows).map((r) => ({ model: r.model, storage_gb: r.storage_gb, label: rowLabel(r) }));

  return (
    <div className="grid gap-4" data-testid="account-price-lists">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current list</CardTitle>
          <CardDescription>
            {current ? <>Version {current.version} · valid {fmtDate(current.valid_from)} – {current.valid_until ? fmtDate(current.valid_until) : "—"} · RMA_c {pctText(current.rma_c)} · Extra_c {pctText(current.extra_c)}</> : "No approved list yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {current && isDue(current.valid_until, today) ? <DueBadge /> : null}
          {current ? <GetPriceList listId={current.id} /> : null}
          {draft ? <Link href={`/price-lists/${draft.id}`} className="inline-flex items-center gap-2 text-sm hover:underline"><ListStatusBadge status="draft" /> Version {draft.version} waiting for approval →</Link> : null}
          {canPrepare && !draft ? <PrepareListButton accountId={accountId} label={current ? "Prepare the refresh" : "Prepare the first list"} primary /> : null}
        </CardContent>
      </Card>

      {canPrepare ? (
        <Card data-testid="price-rules">
          <CardHeader>
            <CardTitle className="text-base">Price rules</CardTitle>
            <CardDescription>
              A fixed US$ amount over the base per model, kept for this client: every new list uses new base + rule; models without a
              rule follow the engine. A model that leaves the base leaves the list (its rule shows &quot;Discontinued&quot;).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RulesEditor accountId={accountId} choices={choices}
              rules={(rules ?? []).map((r) => ({ ...r, increment_usd: Number(r.increment_usd), label: rowLabel({ model: r.model, note: null }) }))} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Versions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Status</TableHead><TableHead>Valid</TableHead><TableHead className="text-right">RMA_c</TableHead><TableHead className="text-right">Extra_c</TableHead></TableRow></TableHeader>
            <TableBody>
              {all.map((l) => (
                <TableRow key={l.id}>
                  <TableCell><Link href={`/price-lists/${l.id}`} className="font-medium hover:underline">v{l.version}</Link></TableCell>
                  <TableCell><ListStatusBadge status={l.status} /></TableCell>
                  <TableCell>{fmtDate(l.valid_from)} – {l.valid_until ? fmtDate(l.valid_until) : "—"}</TableCell>
                  <TableCell className="text-right">{pctText(l.rma_c)}</TableCell>
                  <TableCell className="text-right">{pctText(l.extra_c)}</TableCell>
                </TableRow>
              ))}
              {!all.length ? <TableRow><TableCell colSpan={5} className="text-muted-foreground">No lists yet.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {history.length > 1 ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Price per model across versions</CardTitle><CardDescription>The last {history.length} approved versions, oldest to newest.</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Model</TableHead><TableHead className="text-right">GB</TableHead>{history.map((h) => <TableHead key={h.id} className="text-right">v{h.version}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {skus.map((s) => (
                  <TableRow key={`${s.model}|${s.storage_gb}`}>
                    <TableCell>{rowLabel(s)}</TableCell>
                    <TableCell className="text-right">{s.storage_gb}</TableCell>
                    {history.map((h, i) => {
                      const p = s.prices.get(h.id);
                      const prev = i > 0 ? s.prices.get(history[i - 1].id) : undefined;
                      const cls = p !== undefined && prev !== undefined && p !== prev ? (p > prev ? "text-hkr-action" : "text-emerald-700") : "";
                      return <TableCell key={h.id} className={`text-right ${cls}`}>{p === undefined ? "—" : money2(p)}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
