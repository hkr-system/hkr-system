import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { isDue, pctText } from "@/lib/price-lists/labels";
import { fmtDate } from "@/lib/price-lists/outputs";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { DueBadge, ListStatusBadge } from "@/components/price-lists/badges";
import { GetPriceList } from "@/components/price-lists/get-list";
import { PrepareListButton } from "@/components/price-lists/list-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Price lists" };

// Price lists (Phase 6, SOP P7): the base list (admin) and one row per account with its current list,
// the draft waiting for approval and the refresh date (every 2 weeks).
export default async function PriceListsPage() {
  const access = await checkSection("price-lists");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const isAdmin = user.role === "admin";
  const canPrepare = isAdmin || user.role === "account_specialist";
  const db = await createClient();
  const [accounts, lists, base] = await Promise.all([
    db.from("accounts").select("id, code, name, status").neq("status", "closed").order("code"),
    db.from("price_lists").select("id, account_id, version, status, valid_from, valid_until, rma_c, extra_c")
      .in("status", ["draft", "approved"]).not("account_id", "is", null),
    isAdmin
      ? db.from("price_lists").select("id, version, valid_from, source_file, price_list_rows(count)").is("account_id", null).eq("status", "approved").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const today = todayIn(user.timezone);
  const byAccount = new Map<string, { approved?: (typeof rows)[number]; draft?: (typeof rows)[number] }>();
  const rows = lists.data ?? [];
  for (const l of rows) {
    const cur = byAccount.get(l.account_id!) ?? {};
    if (l.status === "approved") cur.approved = l; else cur.draft = l;
    byAccount.set(l.account_id!, cur);
  }
  const accs = (accounts.data ?? []).map((a) => ({ ...a, ...byAccount.get(a.id) }))
    .filter((a) => canPrepare || a.approved)
    .sort((x, y) => {
      const rank = (a: typeof x) => (a.draft ? 0 : a.approved && isDue(a.approved.valid_until, today) ? 1 : !a.approved ? 2 : 3);
      return rank(x) - rank(y) || x.code.localeCompare(y.code);
    });
  const baseCount = (base.data as unknown as { price_list_rows: { count: number }[] } | null)?.price_list_rows?.[0]?.count ?? 0;

  return (
    <>
      <PageHeader title="Price lists" description="Each client gets the base list plus its RMA amortization and extra margin (SOP ch. 5), refreshed every 2 weeks." />
      <div className="grid gap-4">
        {isAdmin ? (
          <Card data-testid="base-card">
            <CardHeader>
              <CardTitle className="text-base">Base list <span className="text-sm font-normal text-muted-foreground">admin only · never shown to clients or the team</span></CardTitle>
              <CardDescription>
                {base.data ? <>Version {base.data.version} · from {fmtDate(base.data.valid_from)} · {baseCount} prices{base.data.source_file ? ` · file ${base.data.source_file}` : ""}</> : "No base list yet: upload your iPhonePrices file first."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button asChild size="sm"><Link href="/price-lists/base">{base.data ? "Upload or edit the base" : "Upload the base list"}</Link></Button>
              {base.data ? <Button asChild size="sm" variant="outline"><Link href={`/price-lists/${base.data.id}`}>Open</Link></Button> : null}
              {base.data ? <GetPriceList listId={base.data.id} label="Base list" /> : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client lists</CardTitle>
            <CardDescription>
              {canPrepare ? "Prepare runs the engine for that client and builds a draft from the current base; the admin approves it." : "The approved lists of your accounts."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Account</TableHead><TableHead>Current list</TableHead><TableHead className="text-right">RMA_c</TableHead><TableHead className="text-right">Extra_c</TableHead>{canPrepare ? <><TableHead>Draft</TableHead><TableHead /></> : null}</TableRow>
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
                    <TableCell className="text-right">{pctText(a.approved?.rma_c)}</TableCell>
                    <TableCell className="text-right">{pctText(a.approved?.extra_c)}</TableCell>
                    {canPrepare ? (
                      <>
                        <TableCell>{a.draft ? <Link href={`/price-lists/${a.draft.id}`} className="inline-flex items-center gap-2 hover:underline"><ListStatusBadge status="draft" /> v{a.draft.version}</Link> : "—"}</TableCell>
                        <TableCell className="text-right">{!a.draft ? <PrepareListButton accountId={a.id} label={a.approved ? "Refresh" : "Prepare"} /> : null}</TableCell>
                      </>
                    ) : null}
                  </TableRow>
                ))}
                {!accs.length ? <TableRow><TableCell colSpan={canPrepare ? 6 : 4} className="text-muted-foreground">No accounts with an approved list yet.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
