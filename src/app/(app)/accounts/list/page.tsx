import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countryName } from "@/lib/leads/countries";
import { loadTeam } from "@/lib/leads/service";
import { loadAssignments } from "@/lib/orders/service";
import { BILLING_ENTITY_LABEL, OPEN_ORDER_STATUSES, PAYMENT_METHOD_LABEL, type AccountStatus } from "@/lib/orders/constants";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { AccountFilters } from "@/components/accounts/account-filters";
import { SectionTabs } from "@/components/sales/tabs";
import { accountTabs } from "@/lib/sales/tabs";
import { AccountStatusBadge } from "@/components/accounts/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  const access = await checkSection("accounts");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const p = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const db = await createClient();

  let q = db.from("accounts").select("id, code, name, country, market, status, billing_entity, payment_method, is_demo, intermediaries(name)").order("code");
  const search = p("q").replace(/[%,()]/g, " ").trim();
  if (search) q = q.or(`code.ilike.%${search}%,name.ilike.%${search}%,legal_name.ilike.%${search}%`);
  if (["EU", "LATAM", "US", "ROW"].includes(p("market"))) q = q.eq("market", p("market") as "EU");
  if (p("status")) q = q.eq("status", p("status") as AccountStatus);

  const [{ data: accounts }, team, { data: open }] = await Promise.all([
    q, loadTeam(db),
    db.from("orders").select("account_id, total_usd").in("status", OPEN_ORDER_STATUSES),
  ]);
  const assign = await loadAssignments(db, (accounts ?? []).map((a) => a.id));
  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));
  const openBy = new Map<string, { n: number; usd: number }>();
  for (const o of open ?? []) {
    const c = openBy.get(o.account_id) ?? { n: 0, usd: 0 };
    openBy.set(o.account_id, { n: c.n + 1, usd: c.usd + Number(o.total_usd) });
  }
  let rows = accounts ?? [];
  const owner = p("owner");
  if (owner === "none") rows = rows.filter((a) => !assign.get(a.id)?.owner);
  else if (owner) rows = rows.filter((a) => assign.get(a.id)?.owner === owner);
  const canCreate = user.role === "admin" || user.role === "account_specialist";

  return (
    <>
      <PageHeader title="All accounts" description={`${rows.length} client account${rows.length === 1 ? "" : "s"}${user.role === "bd" ? " where you are the owner" : ""}.`}>
        {canCreate ? <Button asChild size="sm"><Link href="/accounts/new">New account</Link></Button> : null}
      </PageHeader>
      <SectionTabs tabs={accountTabs(canCreate)} />
      <AccountFilters owners={team.filter((t) => t.role !== "account_specialist")} showOwner={user.role !== "bd"} />
      <Card>
        <CardContent className="px-0">
          <Table data-testid="accounts-table">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Code</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Route · billing</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Open orders</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => {
                const o = openBy.get(a.id);
                const inter = (a.intermediaries as { name: string } | null)?.name;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4 font-mono text-xs"><Link href={`/accounts/${a.id}`} className="hover:underline">{a.code}</Link></TableCell>
                    <TableCell><Link href={`/accounts/${a.id}`} className="font-medium hover:underline">{a.name}</Link></TableCell>
                    <TableCell>{countryName(a.country)}<span className="ml-1 text-xs text-muted-foreground">{a.market}</span></TableCell>
                    <TableCell className="text-xs">{inter ? `Via ${inter}` : "Direct"} · {BILLING_ENTITY_LABEL[a.billing_entity]}</TableCell>
                    <TableCell className="text-xs">{PAYMENT_METHOD_LABEL[a.payment_method]}</TableCell>
                    <TableCell className="text-xs">{names.get(assign.get(a.id)?.owner ?? "") ?? <span className="text-muted-foreground">No owner</span>}</TableCell>
                    <TableCell className="text-xs" data-tabular>{o ? `${o.n} · US$ ${Math.round(o.usd).toLocaleString("en-US")}` : "—"}</TableCell>
                    <TableCell><AccountStatusBadge status={a.status} /></TableCell>
                  </TableRow>
                );
              })}
              {!rows.length ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No accounts match.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
