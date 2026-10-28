import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { periodRange } from "@/lib/sales/load";
import { rmaTabs } from "@/lib/rmas/tabs";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { PeriodControls, SectionTabs } from "@/components/sales/tabs";
import { BarList, StatTile } from "@/components/viz";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Defect analytics" };

// Brief Phase 4 §5 (admin): defect rate by model and by account = RMA units (OURS) ÷ units shipped.
export default async function AnalyticsPage({ searchParams }: PageProps<"/rmas/analytics">) {
  const access = await checkSection("rmas");
  if (!access.allowed) return <NoAccess />;
  if (access.user.role !== "admin") return <NoAccess message="Defect analytics are for admin." />;
  const sp = await searchParams;
  const period = typeof sp.period === "string" ? sp.period : "365";
  const { from, to } = periodRange(period, todayIn(access.user.timezone));
  const db = await createClient();
  const [{ data: shipped }, { data: units }, { data: accounts }, { data: skus }] = await Promise.all([
    db.from("imei_master").select("account_id, sku_id").gte("shipped_at", from).lte("shipped_at", to).limit(100000),
    db.from("rma_units").select("account_id, model, storage_gb, source, fault_category, imei_check, credit_usd, imei_master_id, created_at")
      .gte("created_at", `${from}T00:00:00Z`).lte("created_at", `${to}T23:59:59Z`).limit(20000),
    db.from("accounts").select("id, code, name"),
    db.from("skus").select("id, model"),
  ]);
  const ours = (units ?? []).filter((u) => u.imei_check === "ours");
  const modelOf = new Map((skus ?? []).map((s) => [s.id, s.model]));
  const code = new Map((accounts ?? []).map((a) => [a.id, a.code]));
  const tally = <T,>(rows: T[], key: (r: T) => string) => rows.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1), new Map<string, number>());
  const shipByModel = tally(shipped ?? [], (s) => modelOf.get(s.sku_id ?? "") ?? "Unknown");
  const rmaByModel = tally(ours, (u) => u.model ?? "Unknown");
  const shipByAcc = tally(shipped ?? [], (s) => code.get(s.account_id) ?? "—");
  const rmaByAcc = tally(ours, (u) => code.get(u.account_id) ?? "—");
  const rate = (r: number, s: number) => (s ? (r / s) * 100 : null);
  const table = (rm: Map<string, number>, sh: Map<string, number>) => [...new Set([...rm.keys(), ...sh.keys()])]
    .map((k) => ({ k, rma: rm.get(k) ?? 0, shipped: sh.get(k) ?? 0, rate: rate(rm.get(k) ?? 0, sh.get(k) ?? 0) }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.rma - a.rma);
  const totalShipped = (shipped ?? []).length;
  const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)} %`);

  return (
    <>
      <PageHeader title="Defect analytics" description="RMA units verified OURS ÷ units shipped in the period (IMEI master). The SOP promise is 1–2 % on the general stock.">
        <PeriodControls showGrain={false} />
      </PageHeader>
      <SectionTabs tabs={rmaTabs(access.user.role)} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Units shipped" value={totalShipped.toLocaleString("en-US")} sub="with IMEI in the master" />
        <StatTile label="RMA units (OURS)" value={ours.length} sub={`${ours.filter((u) => u.source === "testing").length} at testing · ${ours.filter((u) => u.source === "end_customer").length} from end customers`} />
        <StatTile label="Defect rate" value={pct(rate(ours.length, totalShipped))} tone="attention" />
        <StatTile label="NOT FOUND claims" value={(units ?? []).length - ours.length} sub="never shipped to that client" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {[["By model", table(rmaByModel, shipByModel)], ["By account", table(rmaByAcc, shipByAcc)]].map(([title, rows]) => (
          <Card key={title as string}>
            <CardHeader><CardTitle className="text-sm">{title as string}</CardTitle><CardDescription>Highest rate first</CardDescription></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">{title === "By model" ? "Model" : "Account"}</TableHead><TableHead className="text-right">Shipped</TableHead><TableHead className="text-right">RMA</TableHead><TableHead className="pr-4 text-right">Rate</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(rows as ReturnType<typeof table>).map((r) => (
                    <TableRow key={r.k}><TableCell className="pl-4">{r.k}</TableCell><TableCell className="text-right" data-tabular>{r.shipped}</TableCell><TableCell className="text-right" data-tabular>{r.rma}</TableCell>
                      <TableCell className={`pr-4 text-right ${r.rate !== null && r.rate > 2 ? "font-medium text-hkr-action" : ""}`} data-tabular>{pct(r.rate)}</TableCell></TableRow>
                  ))}
                  {!(rows as unknown[]).length ? <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No data in this period.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader><CardTitle className="text-sm">Faults reported</CardTitle><CardDescription>OURS units, by category</CardDescription></CardHeader>
          <CardContent><BarList rows={[...tally(ours, (u) => u.fault_category).entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} empty="No RMA units" /></CardContent>
        </Card>
      </div>
    </>
  );
}
