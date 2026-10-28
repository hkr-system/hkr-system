import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { money } from "@/lib/orders/constants";
import { periodRange } from "@/lib/sales/load";
import { SALES_TABS } from "@/lib/sales/tabs";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { PeriodControls, SectionTabs } from "@/components/sales/tabs";
import { BarList } from "@/components/viz";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Sales mix" };

type Line = {
  id: string; qty: number; unit_price_usd: number; account_id: string;
  orders: { order_date: string; status: string; number: string }; skus: { model: string; storage_gb: number; color: string } | null;
};

// Best-selling models and configurations, and the prices each client accepted (brief Phase 5 §7,
// pulled forward by Gabriel Oct 27 2026). Price vs the list offered + extra margin come with Phase 6.
export default async function SalesMixPage({ searchParams }: PageProps<"/sales/mix">) {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const period = typeof sp.period === "string" ? sp.period : "180";
  const model = typeof sp.model === "string" ? sp.model : "";
  const { from, to } = periodRange(period, todayIn(user.timezone));
  const db = await createClient();
  const [{ data: raw }, { data: accounts }] = await Promise.all([
    db.from("order_lines").select("id, qty, unit_price_usd, account_id, orders!inner(order_date, status, number), skus(model, storage_gb, color)")
      .gte("orders.order_date", from).lte("orders.order_date", to).neq("orders.status", "quoted").limit(20000),
    db.from("accounts").select("id, code, name"),
  ]);
  const lines = ((raw ?? []) as unknown as Line[]).filter((l) => l.skus);
  const { data: fin } = user.role === "admin" && lines.length
    ? await db.from("order_lines_finance").select("order_line_id, base_price_usd").in("order_line_id", lines.map((l) => l.id).slice(0, 5000))
    : { data: [] as { order_line_id: string; base_price_usd: number | null }[] };
  const base = new Map((fin ?? []).map((f) => [f.order_line_id, f.base_price_usd === null ? null : Number(f.base_price_usd)]));
  const code = new Map((accounts ?? []).map((a) => [a.id, a]));

  type Agg = { units: number; amount: number; min: number; max: number; orders: Set<string>; cost: number; costAmt: number };
  const agg = (key: (l: Line) => string, rows = lines) => {
    const m = new Map<string, Agg>();
    for (const l of rows) {
      const k = key(l);
      const a = m.get(k) ?? { units: 0, amount: 0, min: Infinity, max: 0, orders: new Set<string>(), cost: 0, costAmt: 0 };
      const p = Number(l.unit_price_usd);
      a.units += l.qty; a.amount += l.qty * p; a.min = Math.min(a.min, p); a.max = Math.max(a.max, p); a.orders.add(l.orders.number + l.account_id);
      const b = base.get(l.id);
      if (b !== undefined && b !== null) { a.cost += l.qty * b; a.costAmt += l.qty * p; }
      m.set(k, a);
    }
    return [...m.entries()].sort((a, b) => b[1].units - a[1].units);
  };
  const byModel = agg((l) => l.skus!.model);
  const byConfig = agg((l) => `${l.skus!.model} ${l.skus!.storage_gb}GB ${l.skus!.color}`);
  const modelAvg = new Map(byModel.map(([k, a]) => [k, a.amount / a.units]));
  const models = byModel.map(([k]) => k);
  const pick = model && models.includes(model) ? model : models[0] ?? "";
  const byClient = agg((l) => l.account_id, lines.filter((l) => l.skus!.model === pick));
  const avgP = (a: Agg) => a.amount / a.units;
  const margin = (a: Agg) => (a.costAmt ? ((a.costAmt - a.cost) / a.costAmt) * 100 : null);

  return (
    <>
      <PageHeader title="Sales mix" description={`Units and prices from invoiced orders${user.role === "bd" ? " of your accounts" : ""}, by order date.`}>
        <PeriodControls showGrain={false} />
      </PageHeader>
      <SectionTabs tabs={SALES_TABS} />
      <div className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Best-selling models</CardTitle><CardDescription>Units sold</CardDescription></CardHeader>
            <CardContent><BarList rows={byModel.slice(0, 10).map(([k, a]) => ({ label: k, value: a.units, href: `/sales/mix?period=${period}&model=${encodeURIComponent(k)}` }))} empty="No sales in this period" /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Best-selling configurations</CardTitle><CardDescription>Model · storage · colour, units</CardDescription></CardHeader>
            <CardContent><BarList rows={byConfig.slice(0, 10).map(([k, a]) => ({ label: k, value: a.units }))} empty="No sales in this period" /></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Price by model</CardTitle><CardDescription>Average, lowest and highest unit price accepted{user.role === "admin" ? "; margin on the base price (admin only)" : ""}.</CardDescription></CardHeader>
          <CardContent className="px-0">
            <Table data-testid="mix-models">
              <TableHeader><TableRow>
                <TableHead className="pl-4">Model</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Avg price</TableHead><TableHead className="text-right">Lowest</TableHead><TableHead className="text-right">Highest</TableHead>
                {user.role === "admin" ? <TableHead className="pr-4 text-right">Margin</TableHead> : null}
              </TableRow></TableHeader>
              <TableBody>
                {byModel.map(([k, a]) => (
                  <TableRow key={k}>
                    <TableCell className="pl-4"><Link href={`/sales/mix?period=${period}&model=${encodeURIComponent(k)}`} className="hover:underline">{k}</Link></TableCell>
                    <TableCell className="text-right" data-tabular>{a.units.toLocaleString("en-US")}</TableCell>
                    <TableCell className="text-right" data-tabular>{a.orders.size}</TableCell>
                    <TableCell className="text-right" data-tabular>{money(avgP(a))}</TableCell>
                    <TableCell className="text-right" data-tabular>{money(a.min)}</TableCell>
                    <TableCell className="text-right" data-tabular>{money(a.max)}</TableCell>
                    {user.role === "admin" ? <TableCell className="pr-4 text-right" data-tabular>{margin(a) === null ? "—" : `${margin(a)!.toFixed(1)} %`}</TableCell> : null}
                  </TableRow>
                ))}
                {!byModel.length ? <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No sales in this period.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {pick ? (
          <Card>
            <CardHeader>
              <CardTitle>Prices accepted by client · {pick}</CardTitle>
              <CardDescription>
                “vs average” = the client&apos;s average price against all clients for this model: clients above it accept higher prices.
                Choose another model in the table above. Price vs the list offered and the extra margin possible per client come with the price-list engine (Phase 6, admin only).
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table data-testid="mix-clients">
                <TableHeader><TableRow>
                  <TableHead className="pl-4">Client</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Avg price</TableHead>
                  <TableHead className="text-right">Highest accepted</TableHead><TableHead className="pr-4 text-right">vs average</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {byClient.sort((a, b) => avgP(b[1]) - avgP(a[1])).map(([k, a]) => {
                    const d = (avgP(a) / (modelAvg.get(pick) ?? avgP(a)) - 1) * 100;
                    return (
                      <TableRow key={k}>
                        <TableCell className="pl-4"><Link href={`/accounts/${k}`} className="font-mono text-xs hover:underline">{code.get(k)?.code ?? "—"}</Link><span className="block text-xs text-muted-foreground">{code.get(k)?.name}</span></TableCell>
                        <TableCell className="text-right" data-tabular>{a.units}</TableCell>
                        <TableCell className="text-right" data-tabular>{money(avgP(a))}</TableCell>
                        <TableCell className="text-right" data-tabular>{money(a.max)}</TableCell>
                        <TableCell className={cn("pr-4 text-right", d > 0.5 ? "text-emerald-700" : d < -0.5 ? "text-hkr-action" : "")} data-tabular>{d >= 0 ? "+" : ""}{d.toFixed(1)} %</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
