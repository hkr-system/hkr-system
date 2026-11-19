import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { BRANDS, BRAND_LABEL, isBrand, type Brand } from "@/lib/brands";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { isDue, pctText } from "@/lib/price-lists/labels";
import { fmtDate } from "@/lib/price-lists/outputs";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { PRICE_LIST_TABS } from "@/lib/price-lists/tabs";
import { DueBadge, ListStatusBadge } from "@/components/price-lists/badges";
import { GetPriceList } from "@/components/price-lists/get-list";
import { PrepareListButton } from "@/components/price-lists/list-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LIST_STATES, LIST_STATE_HINT, LIST_STATE_LABEL, LIST_STATE_STYLE, countStates, isListState } from "@/lib/price-lists/send-status";
import { CHANNEL_LABEL, loadListStates } from "@/lib/price-lists/versions";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Price lists" };

// Price lists (Phase 6, SOP P7): the base list (admin) and one row per account with its current list,
// the draft waiting for approval and the refresh date (every 2 weeks).
export default async function PriceListsPage({ searchParams }: PageProps<"/price-lists">) {
  const sp = await searchParams;
  const brand: Brand = isBrand(sp.brand) ? sp.brand : "iphone";
  const stateFilter = isListState(sp.state) ? sp.state : null;
  const access = await checkSection("price-lists");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const isAdmin = user.role === "admin";
  const canPrepare = isAdmin || user.role === "account_specialist";
  const db = await createClient();
  const today = todayIn(user.timezone);
  const [accounts, lists, base, states] = await Promise.all([
    db.from("accounts").select("id, code, name, status").neq("status", "closed").order("code"),
    db.from("price_lists").select("id, account_id, version, status, valid_from, valid_until, rma_c, extra_c")
      .in("status", ["draft", "approved"]).not("account_id", "is", null).eq("brand", brand),
    isAdmin
      ? db.from("price_lists").select("id, brand, version, valid_from, source_file, price_list_rows(count)").is("account_id", null).eq("status", "approved")
      : Promise.resolve({ data: [] }),
    loadListStates(db, today),
  ]);
  // state of this brand's list per client (active + onboarding accounts), Nov 19 2026
  const stateOf = new Map(states.flatMap((a) => a.brands.filter((b) => b.brand === brand).map((b) => [a.id, b] as const)));
  const counts = countStates([...stateOf.values()].map((b) => b.state));
  const qs = (st: string | null) => { const p = new URLSearchParams(); if (brand !== "iphone") p.set("brand", brand); if (st) p.set("state", st); const t = p.toString(); return t ? `/price-lists?${t}` : "/price-lists"; };
  const byAccount = new Map<string, { approved?: (typeof rows)[number]; draft?: (typeof rows)[number] }>();
  const rows = lists.data ?? [];
  for (const l of rows) {
    const cur = byAccount.get(l.account_id!) ?? {};
    if (l.status === "approved") cur.approved = l; else cur.draft = l;
    byAccount.set(l.account_id!, cur);
  }
  const accs = (accounts.data ?? []).map((a) => ({ ...a, ...byAccount.get(a.id) }))
    .filter((a) => canPrepare || a.approved)
    .filter((a) => !stateFilter || stateOf.get(a.id)?.state === stateFilter)
    .sort((x, y) => {
      // what needs work first: draft to approve, refresh due, approved but not sent, then up to date (paused accounts last)
      const order = ["waiting_approval", "needs_refresh", "not_sent", "up_to_date"];
      const rank = (a: typeof x) => { const st = stateOf.get(a.id)?.state; return st ? order.indexOf(st) : a.draft ? 0 : a.approved && isDue(a.approved.valid_until, today) ? 1 : 4; };
      return rank(x) - rank(y) || x.code.localeCompare(y.code);
    });
  const bases = BRANDS.map((b) => {
    const l = (base.data ?? []).find((x) => x.brand === b);
    return { brand: b, list: l, count: (l as unknown as { price_list_rows?: { count: number }[] } | undefined)?.price_list_rows?.[0]?.count ?? 0 };
  });

  return (
    <>
      <PageHeader title="Price lists" description="Each client gets the base list plus its RMA amortization and extra margin (SOP ch. 5), refreshed every 2 weeks." />
      <SectionTabs tabs={PRICE_LIST_TABS} />
      <div className="grid gap-4">
        {isAdmin ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {bases.map(({ brand: b, list, count }) => (
              <Card key={b} data-testid={b === "iphone" ? "base-card" : `base-card-${b}`}>
                <CardHeader>
                  <CardTitle className="text-base">{BRAND_LABEL[b]} base list <span className="text-sm font-normal text-muted-foreground">admin only · never shown to clients or the team</span></CardTitle>
                  <CardDescription>
                    {list ? <>Version {list.version} · from {fmtDate(list.valid_from)} · {count} prices{list.source_file ? ` · file ${list.source_file}` : ""}</>
                      : `No ${BRAND_LABEL[b]} base list yet: upload your ${b === "samsung" ? "Samsung" : "iPhonePrices"} file first.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <Button asChild size="sm" variant={b === "iphone" ? "default" : "outline"}>
                    <Link href={b === "iphone" ? "/price-lists/base" : `/price-lists/base?brand=${b}`} data-testid={`base-link-${b}`}>{list ? "Upload or edit the base" : "Upload the base list"}</Link>
                  </Button>
                  {list ? <Button asChild size="sm" variant="outline"><Link href={`/price-lists/${list.id}`}>Open</Link></Button> : null}
                  {list ? <GetPriceList listId={list.id} label={`${BRAND_LABEL[b]} base list`} /> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client lists</CardTitle>
            <nav className="flex gap-1 pt-1" aria-label="Brand">
              {BRANDS.map((b) => (
                <Link key={b} href={`${b === "iphone" ? "/price-lists" : `/price-lists?brand=${b}`}${stateFilter ? `${b === "iphone" ? "?" : "&"}state=${stateFilter}` : ""}`} data-testid={`brand-tab-${b}`}
                  className={`rounded-md border px-3 py-1 text-sm ${b === brand ? "border-hkr-accent bg-hkr-accent-tint font-medium" : "text-muted-foreground hover:bg-muted"}`}>
                  {BRAND_LABEL[b]}
                </Link>
              ))}
            </nav>
            <CardDescription>
              {canPrepare ? "Prepare runs the engine for that client and builds a draft from the current base; the admin approves it." : "The approved lists of your accounts."}
            </CardDescription>
            <nav className="flex flex-wrap gap-1.5 pt-2" aria-label="Does the client have it?" data-testid="list-state-filter">
              <Link href={qs(null)} className={cn("rounded-md border px-3 py-1 text-sm", !stateFilter ? "border-hkr-accent bg-hkr-accent-tint font-medium" : "text-muted-foreground hover:bg-muted")}>All</Link>
              {LIST_STATES.map((st) => (
                <Link key={st} href={qs(st)} title={LIST_STATE_HINT[st]} data-testid={`state-chip-${st}`}
                  className={cn("rounded-md border px-3 py-1 text-sm", stateFilter === st ? "border-hkr-accent bg-hkr-accent-tint font-medium" : "text-muted-foreground hover:bg-muted")}>
                  {LIST_STATE_LABEL[st]} <span className="tabular-nums">{counts[st]}</span>
                </Link>
              ))}
            </nav>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Account</TableHead><TableHead>Current list</TableHead><TableHead>Client has</TableHead><TableHead className="text-right">RMA_c</TableHead><TableHead className="text-right">Extra_c</TableHead>{canPrepare ? <><TableHead>Draft</TableHead><TableHead /></> : null}</TableRow>
              </TableHeader>
              <TableBody>
                {accs.map((a) => (
                  <TableRow key={a.id} data-testid={`pl-${a.code}`}>
                    <TableCell><Link href={`/accounts/${a.id}?tab=price-lists`} className="font-medium hover:underline">{a.code}</Link> <span className="text-muted-foreground">{a.name}</span></TableCell>
                    <TableCell>
                      {a.approved ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <Link href={`/price-lists/${a.approved.id}`} className="hover:underline">v{a.approved.version} · until {fmtDate(a.approved.valid_until ?? a.approved.valid_from)}</Link>
                          {isDue(a.approved.valid_until, today) ? <DueBadge /> : null}
                        </span>
                      ) : <span className="text-muted-foreground">No list yet</span>}
                    </TableCell>
                    <TableCell data-testid="client-has">
                      {(() => {
                        const st = stateOf.get(a.id);
                        if (!st) return <span className="text-muted-foreground">—</span>;
                        return (
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", LIST_STATE_STYLE[st.state])} data-testid="list-state">{LIST_STATE_LABEL[st.state]}</span>
                            <span className="text-sm text-muted-foreground">
                              {st.sent ? `v${st.sent.version} · sent ${fmtDate(st.sent.sentOn)} · ${CHANNEL_LABEL[st.sent.channel] ?? st.sent.channel} · ${st.sent.what}` : "never sent"}
                            </span>
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">{pctText(a.approved?.rma_c)}</TableCell>
                    <TableCell className="text-right">{pctText(a.approved?.extra_c)}</TableCell>
                    {canPrepare ? (
                      <>
                        <TableCell>{a.draft ? <Link href={`/price-lists/${a.draft.id}`} className="inline-flex items-center gap-2 hover:underline"><ListStatusBadge status="draft" /> v{a.draft.version}</Link> : "—"}</TableCell>
                        <TableCell className="text-right">{!a.draft ? <PrepareListButton accountId={a.id} brand={brand} label={a.approved ? "Refresh" : "Prepare"} /> : null}</TableCell>
                      </>
                    ) : null}
                  </TableRow>
                ))}
                {!accs.length ? <TableRow><TableCell colSpan={canPrepare ? 7 : 5} className="text-muted-foreground">{stateFilter ? `No client is "${LIST_STATE_LABEL[stateFilter]}" for ${BRAND_LABEL[brand]}.` : `No accounts with an approved ${BRAND_LABEL[brand]} list yet.`}</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
