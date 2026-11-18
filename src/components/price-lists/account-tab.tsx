import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BRANDS, BRAND_LABEL } from "@/lib/brands";
import { compareRows, modelKey, rowLabel } from "@/lib/price-lists/models";
import { fmtDate, money2 } from "@/lib/price-lists/outputs";
import { isDue, pctText } from "@/lib/price-lists/labels";
import { DueBadge, ListStatusBadge } from "./badges";
import { GetPriceList } from "./get-list";
import { PrepareListButton } from "./list-actions";
import { RulesEditor } from "./rules-editor";
import { ListSends } from "./sends";
import { CHANNEL_LABEL } from "@/lib/price-lists/versions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Account → Price lists tab, per brand: current list, versions and the change per model across the last 4 versions (brief item 8).
export async function AccountPriceLists({ accountId, canPrepare, today, isAdmin = false }: { accountId: string; canPrepare: boolean; today: string; isAdmin?: boolean }) {
  const db = await createClient();
  const { data: lists } = await db.from("price_lists").select("id, brand, version, status, valid_from, valid_until, rma_c, extra_c, approved_at, approved_by, base_list_id")
    .eq("account_id", accountId).order("version", { ascending: false });
  // one section per brand (Gabriel, Nov 4 2026): a client that buys both has an iPhone list and a Samsung list
  const sections = BRANDS.map((brand) => {
    const all = (lists ?? []).filter((l) => l.brand === brand);
    return {
      brand, all, current: all.find((l) => l.status === "approved"), draft: all.find((l) => l.status === "draft"),
      history: all.filter((l) => l.status !== "draft").slice(0, 4).reverse(),
    };
  });
  const historyIds = sections.flatMap((x) => x.history.map((h) => h.id));
  const latestIds = sections.map((x) => (x.draft ?? x.current)?.id).filter((x): x is string => !!x);
  const [{ data: rows }, { data: rules }, { data: latestRows }, { data: sends }, { data: people }, { data: bases }] = await Promise.all([
    historyIds.length ? db.from("price_list_rows").select("price_list_id, model, storage_gb, note, price_usd").in("price_list_id", historyIds) : Promise.resolve({ data: [] }),
    // client price rules (admin + specialist): fixed US$ over the base, models offered = the latest lists of this client
    canPrepare ? db.rpc("price_rules_for", { p_account: accountId }) : Promise.resolve({ data: [] }),
    canPrepare && latestIds.length ? db.from("price_list_rows").select("model, storage_gb, note, sort_order").in("price_list_id", latestIds) : Promise.resolve({ data: [] }),
    // which version the client has in hand (Gabriel, Nov 18 2026)
    db.from("price_list_sends").select("id, price_list_id, sent_on, channel, created_by").eq("account_id", accountId).order("sent_on", { ascending: false }).order("created_at", { ascending: false }),
    db.from("profiles").select("user_id, full_name, email"),
    db.rpc("price_list_base_versions"),
  ]);
  const nameOf = (uid: string | null) => { const p = (people ?? []).find((x) => x.user_id === uid); return p ? p.full_name || p.email : "—"; };
  const baseV = (id: string | null) => (bases ?? []).find((b) => b.id === id)?.version;
  const sendsOf = (listId: string) => (sends ?? []).filter((s) => s.price_list_id === listId);
  const lastSentOf = (ids: string[]) => (sends ?? []).find((s) => ids.includes(s.price_list_id));
  const choices = [...(latestRows ?? [])].sort(compareRows).map((r) => ({ model: r.model, storage_gb: r.storage_gb, label: rowLabel(r) }));

  return (
    <div className="grid gap-4" data-testid="account-price-lists">
      {sections.map(({ brand, all, current, draft, history }) => {
        const grid = new Map<string, { model: string; storage_gb: number; note: string | null; prices: Map<string, number> }>();
        for (const r of rows ?? []) {
          if (!history.some((h) => h.id === r.price_list_id)) continue;
          const k = modelKey(r.model, r.storage_gb);
          const g = grid.get(k) ?? { model: r.model, storage_gb: r.storage_gb, note: r.note, prices: new Map() };
          g.prices.set(r.price_list_id, Number(r.price_usd));
          grid.set(k, g);
        }
        const skus = [...grid.values()].sort(compareRows);
        const label = BRAND_LABEL[brand];
        // a brand the client does not buy stays one short line (nothing to prepare unless someone wants it)
        if (!all.length && brand !== "iphone") {
          return (
            <Card key={brand} data-testid={`pl-section-${brand}`}>
              <CardHeader>
                <CardTitle className="text-base">{label} list</CardTitle>
                <CardDescription>No {label} list for this client yet.</CardDescription>
              </CardHeader>
              {canPrepare ? <CardContent><PrepareListButton accountId={accountId} brand={brand} label={`Prepare the first ${label} list`} /></CardContent> : null}
            </Card>
          );
        }
        return (
          <div key={brand} className="grid gap-4" data-testid={`pl-section-${brand}`}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{label} · current list</CardTitle>
                <CardDescription>
                  {current ? <>Version {current.version} · valid {fmtDate(current.valid_from)} – {current.valid_until ? fmtDate(current.valid_until) : "—"} · RMA_c {pctText(current.rma_c)} · Extra_c {pctText(current.extra_c)}</> : "No approved list yet."}
                </CardDescription>
                {(() => {
                  const last = lastSentOf(all.map((l) => l.id));
                  const v = last ? all.find((l) => l.id === last.price_list_id)?.version : undefined;
                  if (!current && !last) return null;
                  const behind = current && v !== current.version;
                  return (
                    <p className={`text-sm ${behind ? "text-amber-800" : "text-emerald-700"}`} data-testid={`client-has-${brand}`}>
                      {last ? <>The client has <b>v{v}</b> (sent {fmtDate(last.sent_on)}, {CHANNEL_LABEL[last.channel] ?? last.channel})</> : "The client was never sent a list"}
                      {behind && current ? ` — v${current.version} not sent yet` : last ? " — up to date" : ""}
                    </p>
                  );
                })()}
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                {current && isDue(current.valid_until, today) ? <DueBadge /> : null}
                {current ? <GetPriceList listId={current.id} /> : null}
                {current ? <ListSends listId={current.id} sends={[]} today={today} canDeleteAll={isAdmin} compact /> : null}
                {draft ? <Link href={`/price-lists/${draft.id}`} className="inline-flex items-center gap-2 text-sm hover:underline"><ListStatusBadge status="draft" /> Version {draft.version} waiting for approval →</Link> : null}
                {canPrepare && !draft ? <PrepareListButton accountId={accountId} brand={brand} label={current ? "Prepare the refresh" : `Prepare the first ${label} list`} primary={brand === "iphone"} /> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{label} · versions</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Status</TableHead><TableHead>Valid</TableHead><TableHead className="text-right">RMA_c</TableHead><TableHead className="text-right">Extra_c</TableHead><TableHead>Built on</TableHead><TableHead>Approved</TableHead><TableHead>Sent to the client</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {all.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell><Link href={`/price-lists/${l.id}`} className="font-medium hover:underline">v{l.version}</Link></TableCell>
                        <TableCell><ListStatusBadge status={l.status} /></TableCell>
                        <TableCell>{fmtDate(l.valid_from)} – {l.valid_until ? fmtDate(l.valid_until) : "—"}</TableCell>
                        <TableCell className="text-right">{pctText(l.rma_c)}</TableCell>
                        <TableCell className="text-right">{pctText(l.extra_c)}</TableCell>
                        <TableCell>{baseV(l.base_list_id) ? `base v${baseV(l.base_list_id)}` : "—"}</TableCell>
                        <TableCell>{l.approved_at ? `${fmtDate(l.approved_at.slice(0, 10))} · ${nameOf(l.approved_by)}` : "—"}</TableCell>
                        <TableCell data-testid="version-sent">{sendsOf(l.id).length ? sendsOf(l.id).map((s) => `${fmtDate(s.sent_on)} (${CHANNEL_LABEL[s.channel] ?? s.channel})`).join(", ") : "—"}</TableCell>
                      </TableRow>
                    ))}
                    {!all.length ? <TableRow><TableCell colSpan={8} className="text-muted-foreground">No lists yet.</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {history.length > 1 ? (
              <Card>
                <CardHeader><CardTitle className="text-base">{label} · price per model across versions</CardTitle><CardDescription>The last {history.length} approved versions, oldest to newest.</CardDescription></CardHeader>
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
      })}

      {canPrepare ? (
        <Card data-testid="price-rules">
          <CardHeader>
            <CardTitle className="text-base">Price rules</CardTitle>
            <CardDescription>
              A fixed US$ amount over the base per model, kept for this client (iPhone and Samsung): every new list uses new base + rule;
              models without a rule follow the engine. A model that leaves the base leaves the list (its rule shows &quot;Discontinued&quot;).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RulesEditor accountId={accountId} choices={choices}
              rules={(rules ?? []).map((r) => ({ ...r, increment_usd: Number(r.increment_usd), label: rowLabel({ model: r.model, note: null }) }))} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
