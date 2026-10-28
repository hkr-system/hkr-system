import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayIn } from "@/lib/format";
import { loadTeam } from "@/lib/leads/service";
import { loadAssignments } from "@/lib/orders/service";
import { OPEN_ORDER_STATUSES, money } from "@/lib/orders/constants";
import { accountHealth, type Health } from "@/lib/sales/health";
import { loadSales, periodRange } from "@/lib/sales/load";
import { accountTabs } from "@/lib/sales/tabs";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { PeriodControls, SectionTabs } from "@/components/sales/tabs";
import { BarList, StatTile, compactUsd } from "@/components/viz";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Accounts" };

const HEALTH: Record<Health["level"], { label: string; cls: string; order: number }> = {
  attention: { label: "Needs attention", cls: "bg-hkr-red-tint text-hkr-action", order: 0 },
  inactive: { label: "Inactive", cls: "bg-amber-100 text-amber-800", order: 1 },
  watch: { label: "Open orders", cls: "bg-sky-100 text-sky-800", order: 2 },
  new: { label: "Onboarding", cls: "bg-violet-100 text-violet-800", order: 3 },
  ok: { label: "OK", cls: "bg-emerald-100 text-emerald-800", order: 4 },
};
const usd = (n: number) => money(n).replace("US$ ", "$");

export default async function AccountsOverview({ searchParams }: PageProps<"/accounts">) {
  const access = await checkSection("accounts");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const period = typeof sp.period === "string" ? sp.period : "90";
  const today = todayIn(user.timezone);
  const { from, to } = periodRange(period, today);
  const db = await createClient();

  const [{ data: accounts }, { data: allOrders }, sales, team, { data: setting }, { data: rmaRows }, { data: cnRows }, assign] = await Promise.all([
    db.from("accounts").select("id, code, name, market, status").neq("status", "closed").order("code"),
    db.from("order_overview").select("account_id, status, order_date, payment_awaiting, deposit_confirmed, balance_ok, eta_date").limit(5000),
    loadSales(db, from, to),
    loadTeam(db),
    db.from("settings").select("value").eq("key", "account_inactive_days").maybeSingle(),
    db.from("rma_overview").select("account_id, status, units, created_at").limit(5000),
    db.from("credit_notes").select("account_id, amount, currency, status, issued_on").in("status", ["issued", "applied"]).gte("issued_on", from).lte("issued_on", to),
    loadAssignments(db),   // RLS already limits it to the accounts this user sees
  ]);
  const openRmasOf = (acc: string) => (rmaRows ?? []).filter((r) => r.account_id === acc && r.status !== "closed");
  const rmaUnitsIn = (acc: string) => (rmaRows ?? []).filter((r) => r.account_id === acc && r.created_at! >= from && r.created_at!.slice(0, 10) <= to).reduce((t, r) => t + Number(r.units ?? 0), 0);
  const cnIn = (acc: string) => (cnRows ?? []).filter((c) => c.account_id === acc).reduce((t, c) => t + Number(c.amount), 0);
  const inactiveDays = Number(setting?.value ?? 45);
  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));
  const orders = allOrders ?? [];
  const showMargin = user.role !== "account_specialist";

  const rows = (accounts ?? []).map((a) => {
    const mine = orders.filter((o) => o.account_id === a.id);
    const open = mine.filter((o) => (OPEN_ORDER_STATUSES as readonly string[]).includes(o.status!));
    const last = mine.filter((o) => o.status !== "quoted").map((o) => o.order_date!).sort().at(-1) ?? null;
    const s = sales.filter((r) => r.account_id === a.id);
    const health = accountHealth({
      status: a.status, lastOrderDate: last, openOrders: open.length,
      paymentToConfirm: open.filter((o) => o.payment_awaiting).length,
      balanceDueReady: open.filter((o) => o.status === "ready_to_ship" && !o.balance_ok).length,
      depositDue: open.filter((o) => o.status === "invoiced" && Number(o.deposit_confirmed) <= 0).length,
      etaPending: open.filter((o) => ["deposit_paid", "in_preparation"].includes(o.status!) && !o.eta_date).length,
      openRmas: openRmasOf(a.id).length,
    }, today, inactiveDays);
    return {
      ...a, health, last, open: open.length, owner: names.get(assign.get(a.id)?.owner ?? "") ?? null,
      revenue: s.reduce((t, r) => t + r.total_usd, 0),
      margin: s.some((r) => r.margin_usd !== null) ? s.reduce((t, r) => t + (r.margin_usd ?? 0), 0) : null,
      discounts: s.reduce((t, r) => t + r.rma_discount_usd, 0),
      units: s.reduce((t, r) => t + r.pieces, 0),
      openRmas: openRmasOf(a.id).length, rmaUnits: rmaUnitsIn(a.id), credits: cnIn(a.id),
    };
  }).sort((x, y) => HEALTH[x.health.level].order - HEALTH[y.health.level].order || y.revenue - x.revenue);

  const count = (l: Health["level"]) => rows.filter((r) => r.health.level === l).length;
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const share = (key: "revenue" | "margin" | "discounts") => rows
    .filter((r) => (r[key] ?? 0) > 0)
    .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
    .slice(0, 10)
    .map((r) => ({ label: r.code, value: Math.round(r[key] ?? 0), href: `/accounts/${r.id}`,
      hint: key === "revenue" && totalRev ? `${Math.round((r.revenue / totalRev) * 100)}% of revenue` : r.name }));
  const canCreate = user.role === "admin" || user.role === "account_specialist";
  const daysAgo = (d: string | null) => (d ? Math.floor((Date.parse(today) - Date.parse(d)) / 86400000) : null);

  return (
    <>
      <PageHeader title="Accounts" description={`Health of ${user.role === "bd" ? "your" : "every"} account and who makes the revenue${showMargin ? " and the margin" : ""}.`}>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls showGrain={false} />
          {canCreate ? <Button asChild size="sm"><Link href="/accounts/new">New account</Link></Button> : null}
        </div>
      </PageHeader>
      <SectionTabs tabs={accountTabs(canCreate)} />

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="account-kpis">
          <StatTile label="Accounts" value={rows.length} sub={`${rows.filter((r) => r.status === "active").length} active`} href="/accounts/list" />
          <StatTile label="Need attention" value={count("attention")} tone="attention" />
          <StatTile label={`Inactive (> ${inactiveDays} days)`} value={count("inactive")} tone="attention" />
          <StatTile label="With open orders" value={rows.filter((r) => r.open > 0).length} href="/orders" />
          <StatTile label="With open RMAs" value={rows.filter((r) => r.openRmas > 0).length} href="/rmas" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account health</CardTitle>
            <CardDescription>Most urgent first. Revenue{showMargin ? ", margin" : ""} and discounts for the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table data-testid="health-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Account</TableHead><TableHead>Health</TableHead><TableHead>Why</TableHead>
                  <TableHead>Last order</TableHead><TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  {showMargin ? <TableHead className="text-right">Net margin</TableHead> : null}
                  <TableHead className="text-right">Discounts</TableHead><TableHead>RMAs / CN</TableHead>
                  {user.role !== "bd" ? <TableHead>Owner</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const h = HEALTH[r.health.level];
                  const d = daysAgo(r.last);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4">
                        <Link href={`/accounts/${r.id}`} className="font-mono text-xs hover:underline">{r.code}</Link>
                        <span className="block truncate text-xs text-muted-foreground">{r.name}</span>
                      </TableCell>
                      <TableCell><span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", h.cls)} data-testid="health">{h.label}</span></TableCell>
                      <TableCell className="max-w-64 text-xs whitespace-normal">{r.health.reasons.join(" · ") || "—"}</TableCell>
                      <TableCell className="text-xs">{r.last ? `${formatDate(r.last)} · ${d} d` : "—"}</TableCell>
                      <TableCell className="text-right" data-tabular>{r.open || "—"}</TableCell>
                      <TableCell className="text-right" data-tabular>{r.revenue ? usd(r.revenue) : "—"}</TableCell>
                      {showMargin ? <TableCell className="text-right" data-tabular>{r.margin !== null ? `${usd(r.margin)}${r.revenue ? ` · ${((r.margin / r.revenue) * 100).toFixed(1)}%` : ""}` : "—"}</TableCell> : null}
                      <TableCell className="text-right" data-tabular>{r.discounts ? usd(r.discounts) : "—"}</TableCell>
                      <TableCell className="text-xs">{r.openRmas ? <Link href={`/accounts/${r.id}?tab=rmas`} className="hover:underline">{r.openRmas} open</Link> : "—"}{r.credits ? <span className="block text-muted-foreground">CN {usd(r.credits)}</span> : null}</TableCell>
                      {user.role !== "bd" ? <TableCell className="text-xs">{r.owner ?? <span className="text-muted-foreground">No owner</span>}</TableCell> : null}
                    </TableRow>
                  );
                })}
                {!rows.length ? <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">No accounts.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className={cn("grid gap-4 md:grid-cols-2", showMargin ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
          <Card data-testid="revenue-share"><CardHeader><CardTitle className="text-sm">Who makes the revenue</CardTitle><CardDescription>Share of {usd(totalRev)}</CardDescription></CardHeader>
            <CardContent><BarList rows={share("revenue")} format={compactUsd} empty="No sales in this period" /></CardContent></Card>
          {showMargin ? (
            <Card data-testid="margin-share"><CardHeader><CardTitle className="text-sm">Who makes the margin</CardTitle><CardDescription>Net margin = invoice − base cost{user.role === "bd" ? " (your accounts)" : ""}</CardDescription></CardHeader>
              <CardContent><BarList rows={share("margin")} format={compactUsd} empty="No margin data (base prices missing)" /></CardContent></Card>
          ) : null}
          <Card><CardHeader><CardTitle className="text-sm">Discounts by account</CardTitle><CardDescription>RMA discount lines on orders</CardDescription></CardHeader>
            <CardContent><BarList rows={share("discounts")} format={compactUsd} empty="No discounts in this period" /></CardContent></Card>
          <Card data-testid="cn-share"><CardHeader><CardTitle className="text-sm">Credit notes and RMAs</CardTitle><CardDescription>Credit notes issued in the period · RMA units reported</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <BarList rows={rows.filter((r) => r.credits > 0).sort((a, b) => b.credits - a.credits).slice(0, 8).map((r) => ({ label: r.code, value: Math.round(r.credits), href: `/accounts/${r.id}?tab=rmas` }))} format={compactUsd} empty="No credit notes in this period" />
              <BarList rows={rows.filter((r) => r.rmaUnits > 0).sort((a, b) => b.rmaUnits - a.rmaUnits).slice(0, 8).map((r) => ({ label: r.code, value: r.rmaUnits, hint: "RMA units", href: `/accounts/${r.id}?tab=rmas` }))} empty="No RMA units in this period" />
            </CardContent></Card>
        </div>
      </div>
    </>
  );
}
