import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { loadTeam } from "@/lib/leads/service";
import { loadAssignments } from "@/lib/orders/service";
import { money } from "@/lib/orders/constants";
import { loadSales } from "@/lib/sales/load";
import { addMonths, bucketLabel, monthStart } from "@/lib/sales/series";
import { suggestProjection } from "@/lib/sales/projection";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { HistoryImport, MonthPlanRow } from "@/components/sales/finance-forms";
import { BarList, ColumnChart, StatTile, compactUsd } from "@/components/viz";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Finance" };
const usd = (n: number) => money(n).replace("US$ ", "$");

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const access = await checkSection("finance");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const today = todayIn(user.timezone);
  const year = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : Number(today.slice(0, 4));
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  const db = await createClient();

  // 15 months of history before January feed the suggestion (seasonality needs last year)
  const histFrom = addMonths(months[0], -15);
  const [rows, team, { data: goals }, { data: history }, { data: projections }, { data: accounts }] = await Promise.all([
    loadSales(db, histFrom, `${year}-12-31`),
    loadTeam(db),
    db.from("sales_goals").select("month, owner_user_id, amount_usd").gte("month", months[0]).lte("month", months[11]),
    db.from("sales_history").select("month, amount_usd").gte("month", histFrom),
    db.from("sales_projections").select("month, amount_usd, suggested_usd").gte("month", months[0]).lte("month", months[11]),
    db.from("accounts").select("id, code, name"),
  ]);
  const owners = team.filter((t) => t.role === "bd" || t.role === "admin");
  const system = new Map<string, number>();
  for (const r of rows) system.set(monthStart(r.order_date), (system.get(monthStart(r.order_date)) ?? 0) + r.total_usd);
  const hist = new Map((history ?? []).map((h) => [h.month, Number(h.amount_usd)]));
  // the month's actual: your history figure when given (months before the system), else the system's orders
  const actual = new Map<string, number>();
  for (const k of new Set([...system.keys(), ...hist.keys()])) actual.set(k, hist.get(k) ?? system.get(k) ?? 0);
  const thisMonth = monthStart(today);
  const knownActual = new Map([...actual.entries()].filter(([k]) => k < thisMonth));

  const goal = (m: string, owner: string | null) => (goals ?? []).find((g) => g.month === m && g.owner_user_id === owner)?.amount_usd ?? null;
  const proj = new Map((projections ?? []).map((p) => [p.month, p]));
  const plan = months.map((m) => {
    const s = suggestProjection(m, knownActual);
    return { m, s, actual: actual.get(m) ?? 0, goal: goal(m, null), projection: proj.get(m)?.amount_usd ?? null };
  });

  const ytd = plan.filter((p) => p.m <= thisMonth).reduce((s, p) => s + p.actual, 0);
  const goalYear = plan.reduce((s, p) => s + Number(p.goal ?? 0), 0);
  const projYear = plan.reduce((s, p) => s + Number(p.projection ?? 0), 0);
  const yearRows = rows.filter((r) => r.order_date.startsWith(String(year)));
  const margin = yearRows.reduce((s, r) => s + (r.margin_usd ?? 0), 0);
  const yearRev = yearRows.reduce((s, r) => s + r.total_usd, 0);

  const acc = new Map((accounts ?? []).map((a) => [a.id, a]));
  const assign = await loadAssignments(db);
  const marginBy = (key: (r: (typeof yearRows)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of yearRows) m.set(key(r), (m.get(key(r)) ?? 0) + (r.margin_usd ?? 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value: Math.round(value) }));
  };
  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));

  return (
    <>
      <PageHeader title="Finance" description="Goals, sales history and projections (admin only). Revenue = invoice total of orders from Invoiced on.">
        <div className="flex gap-1 text-sm">
          <Link href={`/finance?year=${year - 1}`} className="rounded-md border px-2 py-1 hover:bg-muted">← {year - 1}</Link>
          <span className="rounded-md bg-hkr-ink px-2 py-1 text-white">{year}</span>
          <Link href={`/finance?year=${year + 1}`} className="rounded-md border px-2 py-1 hover:bg-muted">{year + 1} →</Link>
        </div>
      </PageHeader>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="finance-kpis">
          <StatTile label={`Revenue ${year} to date`} value={usd(ytd)} />
          <StatTile label="Year goal (company)" value={goalYear ? usd(goalYear) : "—"} sub={goalYear ? `${Math.round((ytd / goalYear) * 100)}% reached` : "Set monthly goals below"} />
          <StatTile label="Year projection" value={projYear ? usd(projYear) : "—"} />
          <StatTile label={`Net margin ${year}`} value={usd(margin)} sub={yearRev ? `${((margin / yearRev) * 100).toFixed(1)} % of system revenue` : undefined} />
          <StatTile label="Credit-note spend" value="—" sub="Phase 4" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Revenue per month vs goal</CardTitle>
            <CardDescription>Bars: actual (your history figure for months before the system, otherwise the system&apos;s orders). Dashed line: company goal. Hover a month for the projection.</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart testId="finance-chart" format={compactUsd} goalLabel="Company goal"
              points={plan.map((p) => ({
                key: p.m, label: bucketLabel(p.m, "month"), value: p.actual, goal: p.goal,
                detail: [p.projection !== null ? `projection ${usd(Number(p.projection))}` : "", p.s.value !== null ? `suggested ${usd(p.s.value)}` : ""].filter(Boolean).join(" · ") || undefined,
              }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly plan {year}</CardTitle>
            <CardDescription>
              Goals per month for the company and per owner (each BD sees her own goal on Sales). Projection: your figure; the
              suggestion (hover it for the reasoning) = average of the last 3 months, adjusted by the same month last year when
              that history exists. Empty a box and Save to remove a value.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full min-w-[900px] text-left" data-testid="plan-table">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pl-4 pr-2 font-medium">Month</th>
                  <th className="px-2 py-2 text-right font-medium">System orders</th>
                  <th className="px-2 py-2 font-medium">History (US$)</th>
                  <th className="px-2 py-2 font-medium">Company goal</th>
                  {owners.map((o) => <th key={o.user_id} className="px-2 py-2 font-medium">Goal · {o.full_name.replace(/\s*\(demo\)/, "")}</th>)}
                  <th className="px-2 py-2 text-right font-medium">Suggested</th>
                  <th className="px-2 py-2 font-medium">Projection</th>
                  <th className="px-2 py-2 text-right font-medium">vs goal</th>
                  <th className="px-2 py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <MonthPlanRow key={p.m} month={p.m} label={bucketLabel(p.m, "month")} actual={system.get(p.m) ?? 0} history={hist.get(p.m) ?? null}
                    companyGoal={p.goal} projection={p.projection} suggested={p.s.value} suggestedReason={p.s.reason} past={p.m < thisMonth}
                    owners={owners.map((o) => ({ id: o.user_id, name: o.full_name, goal: goal(p.m, o.user_id) }))} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">Load your sales history</CardTitle><CardDescription>One month per line: month and total US$. Used for the chart and the suggestion; it does not create orders.</CardDescription></CardHeader>
            <CardContent><HistoryImport /></CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-sm">Net margin by account ({year})</CardTitle></CardHeader>
            <CardContent><BarList rows={marginBy((r) => acc.get(r.account_id)?.code ?? "—")} format={compactUsd} empty="No margin data" /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Net margin by owner ({year})</CardTitle></CardHeader>
            <CardContent><BarList rows={marginBy((r) => names.get(assign.get(r.account_id)?.owner ?? "") ?? "No owner")} format={compactUsd} empty="No margin data" /></CardContent></Card>
        </div>
      </div>
    </>
  );
}
