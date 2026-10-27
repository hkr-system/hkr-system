import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { loadTeam } from "@/lib/leads/service";
import { loadAssignments } from "@/lib/orders/service";
import { SALES_TABS } from "@/lib/sales/tabs";
import { OPEN_ORDER_STATUSES, ORDER_STATUS_LABEL, money, type OrderStatus } from "@/lib/orders/constants";
import { grainFor, loadSales, periodRange } from "@/lib/sales/load";
import { addMonths, bucketLabel, monthStart, series } from "@/lib/sales/series";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { PeriodControls, SectionTabs } from "@/components/sales/tabs";
import { BarList, ColumnChart, Progress, StatTile, compactUsd } from "@/components/viz";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sales" };

const usd = (n: number) => money(n).replace("US$ ", "$");

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const period = typeof sp.period === "string" ? sp.period : "90";
  const grain = grainFor(typeof sp.grain === "string" ? sp.grain : undefined, period);
  const today = todayIn(user.timezone);
  const { from, to } = periodRange(period, today);
  const seesRevenue = user.role !== "account_specialist"; // brief §8: the specialist has no sales widgets
  const db = await createClient();

  const thisMonth = monthStart(today);
  const lastMonth = addMonths(thisMonth, -1);
  const [rows, monthRows, { data: open }, { data: accounts }, team, { data: goals }] = await Promise.all([
    loadSales(db, from, to),
    loadSales(db, lastMonth, today),
    db.from("order_overview").select("id, status, total_usd, payment_awaiting, deposit_confirmed, balance_ok, eta_date").in("status", OPEN_ORDER_STATUSES),
    db.from("accounts").select("id, code, name, market"),
    loadTeam(db),
    db.from("sales_goals").select("month, owner_user_id, amount_usd").gte("month", addMonths(from, -1)),
  ]);
  const acc = new Map((accounts ?? []).map((a) => [a.id, a]));
  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));

  // goal for "me": admin → company goal; bd → her own goal
  const goalFor = (month: string) => (goals ?? []).find((g) => g.month === month
    && (user.role === "admin" ? g.owner_user_id === null : g.owner_user_id === user.id))?.amount_usd ?? null;

  const revMonth = monthRows.filter((r) => r.order_date >= thisMonth).reduce((s, r) => s + r.total_usd, 0);
  const revLast = monthRows.filter((r) => r.order_date < thisMonth).reduce((s, r) => s + r.total_usd, 0);
  const total = rows.reduce((s, r) => s + r.total_usd, 0);
  const units = rows.reduce((s, r) => s + r.pieces, 0);
  const marginKnown = rows.some((r) => r.margin_usd !== null);
  const margin = rows.reduce((s, r) => s + (r.margin_usd ?? 0), 0);
  const discounts = rows.reduce((s, r) => s + r.rma_discount_usd, 0);

  const pts = series(rows, from, to, grain).map((b) => ({
    key: b.start, label: bucketLabel(b.start, grain), value: b.revenue,
    detail: `${b.orders} order${b.orders === 1 ? "" : "s"}${b.marginKnown ? ` · margin ${usd(b.margin)}` : ""}`,
    goal: grain === "month" ? goalFor(b.start) : null,
  }));

  const openRows = open ?? [];
  const attention = {
    confirm: openRows.filter((o) => o.payment_awaiting).length,
    deposit: openRows.filter((o) => o.status === "invoiced" && Number(o.deposit_confirmed) <= 0).length,
    balance: openRows.filter((o) => o.status === "ready_to_ship" && !o.balance_ok).length,
    ship: openRows.filter((o) => o.status === "balance_paid").length,
  };

  // breakdowns
  const by = (key: (r: (typeof rows)[number]) => string, val: (r: (typeof rows)[number]) => number = (r) => r.total_usd) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const top = (list: [string, number][], n = 8) => {
    const head = list.slice(0, n);
    const rest = list.slice(n).reduce((s, [, v]) => s + v, 0);
    return rest ? [...head, ["Other", rest] as [string, number]] : head;
  };
  const byAccount = top(by((r) => acc.get(r.account_id)?.code ?? "—")).map(([k, v]) => ({
    label: k, value: Math.round(v), href: k !== "Other" ? `/accounts/${[...acc.values()].find((a) => a.code === k)?.id ?? ""}` : undefined,
    hint: total ? `${Math.round((v / total) * 100)}% of revenue` : undefined,
  }));
  const byMarket = by((r) => acc.get(r.account_id)?.market ?? "—").map(([k, v]) => ({ label: k, value: Math.round(v) }));
  const assign = user.role === "admin" ? await loadAssignments(db) : null;
  const byOwner = assign ? by((r) => names.get(assign.get(r.account_id)?.owner ?? "") ?? "No owner").map(([k, v]) => ({ label: k, value: Math.round(v) })) : [];

  const { data: lines } = rows.length
    ? await db.from("order_lines").select("qty, unit_price_usd, skus(model, storage_gb, color)").in("order_id", rows.map((r) => r.order_id))
    : { data: [] };
  const models = new Map<string, number>();
  for (const l of lines ?? []) {
    const s = l.skus as { model: string; storage_gb: number; color: string } | null;
    const k = s ? `${s.model} ${s.storage_gb}GB` : "Other";
    models.set(k, (models.get(k) ?? 0) + l.qty);
  }
  const byModel = [...models.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v }));

  return (
    <>
      <PageHeader title="Sales" description={seesRevenue
        ? `Revenue = invoice total of orders from Invoiced on, by order date${user.role === "bd" ? " — your accounts" : ""}.`
        : "Orders that need action today. Revenue and goals are shown to admin and BD."}>
        <div className="flex flex-wrap items-center gap-2">
          {seesRevenue ? <PeriodControls /> : null}
          <Button asChild size="sm"><Link href="/orders/new">New order</Link></Button>
        </div>
      </PageHeader>
      <SectionTabs tabs={SALES_TABS} />

      {seesRevenue ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="sales-kpis">
            <StatTile label="Revenue this month" value={usd(revMonth)}
              sub={<Progress value={revMonth} goal={goalFor(thisMonth)} format={usd} />} />
            <StatTile label="Last month" value={usd(revLast)}
              sub={goalFor(lastMonth) ? `${Math.round((revLast / Number(goalFor(lastMonth))) * 100)}% of goal` : undefined} />
            <StatTile label="Revenue in period" value={usd(total)} sub={`${rows.length} orders · ${units.toLocaleString("en-US")} units`} />
            <StatTile label="Average order" value={usd(rows.length ? total / rows.length : 0)} />
            {marginKnown ? <StatTile label={user.role === "bd" ? "Net margin (your accounts)" : "Net margin"} value={usd(margin)} sub={total ? `${((margin / total) * 100).toFixed(1)} % of revenue` : undefined} /> : null}
            <StatTile label="Discounts (RMA)" value={usd(discounts)} sub="RMA discount lines on orders" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue {grain === "day" ? "per day" : grain === "week" ? "per week" : "per month"}</CardTitle>
              <CardDescription>{grain === "month" ? "Dashed line: " + (user.role === "admin" ? "company" : "your") + " monthly goal (set in Finance)." : "Switch to Monthly to compare with the goal."}</CardDescription>
            </CardHeader>
            <CardContent><ColumnChart points={pts} format={compactUsd} goalLabel="Goal" testId="revenue-chart" /></CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card><CardHeader><CardTitle className="text-sm">Revenue by account</CardTitle></CardHeader><CardContent><BarList rows={byAccount} format={compactUsd} /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">By market</CardTitle></CardHeader><CardContent><BarList rows={byMarket} format={compactUsd} /></CardContent></Card>
            {user.role === "admin" ? <Card><CardHeader><CardTitle className="text-sm">By owner</CardTitle></CardHeader><CardContent><BarList rows={byOwner} format={compactUsd} /></CardContent></Card> : null}
            <Card><CardHeader><CardTitle className="text-sm">Units by model</CardTitle></CardHeader><CardContent><BarList rows={byModel} /></CardContent></Card>
          </div>
        </div>
      ) : null}

      <div className={seesRevenue ? "mt-4" : ""}>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Needs action</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatTile label="Open orders" value={openRows.length} sub={usd(openRows.reduce((s, o) => s + Number(o.total_usd), 0))} href="/orders" />
          <StatTile label="Payment to confirm" value={attention.confirm} tone="attention" href="/orders?attention=confirm" />
          <StatTile label="Deposit due" value={attention.deposit} tone="attention" href="/orders?attention=deposit" />
          <StatTile label="Ready, balance due" value={attention.balance} tone="attention" href="/orders?attention=balance" />
          <StatTile label="To ship" value={attention.ship} href="/orders?attention=ship" />
        </div>
        {!seesRevenue ? (
          <Card className="mt-4">
            <CardHeader><CardTitle className="text-sm">Open orders by status</CardTitle></CardHeader>
            <CardContent>
              <BarList rows={(["invoiced", "deposit_paid", "in_preparation", "ready_to_ship", "balance_paid"] as OrderStatus[]).map((s) => ({
                label: ORDER_STATUS_LABEL[s], value: openRows.filter((o) => o.status === s).length, href: `/orders?status=${s}`,
              }))} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
