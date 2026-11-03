import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/roles";
import { HK, loadOps } from "@/lib/dashboard/load";
import { todayIn } from "@/lib/format";
import { dashboardTabs } from "@/lib/dashboard/tabs";
import { buildAlerts } from "@/lib/dashboard/alerts";
import { addDays, dayMonth } from "@/lib/dashboard/dates";
import { thursdayQueue, rmaAskQueue } from "@/lib/dashboard/updates";
import { timeUntil } from "@/lib/rmas/cutoff";
import { loadSales } from "@/lib/sales/load";
import { money, OPEN_ORDER_STATUSES } from "@/lib/orders/constants";
import { OPEN_STAGES } from "@/lib/leads/constants";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { BarList, StatTile } from "@/components/viz";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const INVOICED_PLUS = ["invoiced", "deposit_paid", "in_preparation", "ready_to_ship", "balance_paid", "shipped", "delivered", "closed"];

// Dashboard per role (brief §8). Every widget links to its filtered list. RLS scopes everything: a bd sees her accounts.
//   admin: everything · bd: own accounts, sales of her accounts, leads; no daily report, no batch countdown, no credit notes
//   specialist: operations (orders, RMAs, batch, report, queues); no sales, no leads widgets
export default async function DashboardPage() {
  const access = await checkSection("dashboard");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const role = user.role;
  const firstName = user.fullName.split(/\s+/)[0] || user.email;
  const db = await createClient();
  const now = new Date();

  const today0 = todayIn(HK);
  const monthStart = `${today0.slice(0, 7)}-01`;
  const prevStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
  const [ops, chats, escalations, units, leads, sales, creditNotes] = await Promise.all([
    loadOps(db, now),
    db.from("wa_conversations").select("last_inbound_at, last_outbound_at").neq("status", "resolved").not("last_inbound_at", "is", null).limit(2000)
      .then((r) => (r.data ?? []).filter((c) => !c.last_outbound_at || c.last_inbound_at! > c.last_outbound_at).length),
    db.from("escalations").select("id, answer_by").eq("status", "open").limit(500).then((r) => r.data ?? []),
    db.from("rma_units").select("unit_status, batch_id, rma_batches(status, cutoff_date), accounts(intermediary_id), rmas!inner(status)")
      .eq("resolution", "return_hk").in("rmas.status", ["approved", "awaiting_return", "in_batch"]).in("unit_status", ["reported", "verified", "awaiting_shipment"]).limit(5000).then((r) => r.data ?? []),
    role === "account_specialist" ? Promise.resolve([])
      : db.from("leads").select("stage, tier, created_at").limit(10000).then((r) => r.data ?? []),
    role === "account_specialist" ? Promise.resolve([]) : loadSales(db, prevStart, today0),
    role === "admin"
      ? db.from("credit_notes").select("amount, issued_on, status").in("status", ["issued", "applied"]).gte("issued_on", `${today0.slice(0, 4)}-01-01`).then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);
  const today = ops.today;

  // orders
  const open = ops.orders.filter((o) => (OPEN_ORDER_STATUSES as readonly string[]).includes(o.status));
  const openUsd = open.reduce((s, o) => s + o.payable_total, 0);
  const toShip = ops.orders.filter((o) => o.status === "balance_paid");
  const alerts = buildAlerts({ orders: ops.orders, rmas: ops.rmas, today, cutoffDate: ops.cutoff.date });
  const paymentAlerts = alerts.filter((a) => a.kind === "balance").length;

  // queues
  const thursday = thursdayQueue(ops.accounts, ops.orders, ops.rmas, ops.updates, ops.week);
  const thursdayTodo = thursday.filter((q) => !q.sent).length;
  const askTodo = rmaAskQueue(ops.intermediaries, ops.accounts, ops.updates, ops.week).reduce((n, g) => n + g.clients.filter((c) => !c.sent).length, 0);
  const lateEsc = escalations.filter((e) => e.answer_by && e.answer_by < now.toISOString()).length;

  // RMAs pending shipment by intermediary (return to HK, not in a shipped batch)
  type Unit = { batch_id: string | null; rma_batches: { status: string } | null; accounts: { intermediary_id: string | null } | null };
  const imName = new Map(ops.intermediaries.map((i) => [i.id, i.name]));
  const byIm = new Map<string, { inBatch: number; toBatch: number }>();
  for (const u of units as unknown as Unit[]) {
    if (u.rma_batches && u.rma_batches.status !== "open") continue;
    const key = u.accounts?.intermediary_id ?? "direct";
    const g = byIm.get(key) ?? { inBatch: 0, toBatch: 0 };
    if (u.batch_id) g.inBatch++; else g.toBatch++;
    byIm.set(key, g);
  }
  const rmaRows = [...byIm.entries()].map(([k, g]) => ({ k, name: k === "direct" ? "Direct to Hong Kong" : imName.get(k) ?? "Intermediary", ...g }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rmaPending = rmaRows.reduce((s, r) => s + r.inBatch + r.toBatch, 0);

  // sales (admin, bd own accounts): revenue = invoice total of orders ≥ Invoiced, by order date
  const inMonth = (from: string, to: string) => sales.filter((s) => INVOICED_PLUS.includes(s.status) && s.order_date >= from && s.order_date <= to)
    .reduce((t, s) => t + s.total_usd, 0);
  const salesThis = inMonth(monthStart, today);
  const salesPrev = inMonth(prevStart, addDays(monthStart, -1));

  // leads by stage with 30-day change
  const since30 = addDays(today, -30);
  const leadRows = OPEN_STAGES.map((stage) => {
    const rows = leads.filter((l) => l.stage === stage);
    const added = rows.filter((l) => l.created_at.slice(0, 10) >= since30).length;
    const tiers = ["A", "B", "C"].map((t) => `${t} ${rows.filter((l) => l.tier === t).length}`).join(" · ");
    return { label: stage, value: rows.length, href: `/leads/list?stage=${encodeURIComponent(stage)}`, hint: `+${added} in 30 days · tier ${tiers}` };
  });
  const leads30 = leads.filter((l) => l.created_at.slice(0, 10) >= since30).length;

  // credit-note spend (admin)
  const cnMonth = creditNotes.filter((c) => (c.issued_on ?? "") >= monthStart).reduce((s, c) => s + Number(c.amount), 0);
  const cnYear = creditNotes.reduce((s, c) => s + Number(c.amount), 0);

  const ops_ = role !== "bd"; // daily report + batch countdown: admin and specialist
  return (
    <>
      <PageHeader title={`Welcome, ${firstName}`} description={`${ROLE_LABELS[role]} · ${dayMonth(today, "en")} in Hong Kong. Every figure links to its list.`} />
      <SectionTabs tabs={dashboardTabs(role)} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="dashboard-tiles">
        <StatTile label="Open orders" value={open.length} sub={money(openUsd)} href="/orders" />
        <StatTile label="Pending shipment" value={toShip.length} sub="Balance paid, not shipped" href="/orders?attention=ship" />
        <StatTile label="Balance overdue" value={paymentAlerts} tone="attention" sub="Ready to ship > 2 days" href="#alerts" />
        <StatTile label="Unanswered WhatsApp" value={chats} tone="attention" href="/whatsapp" />
        <StatTile label="Thursday update" value={thursdayTodo} tone="attention" sub={`${thursday.length - thursdayTodo} of ${thursday.length} sent this week`} href="/dashboard/thursday" />
        <StatTile label="For the SD" value={escalations.length} tone="attention" sub={lateEsc ? `${lateEsc} past the time promised` : "Open escalations"} href="/dashboard/escalations" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" id="alerts" data-testid="alerts">
          <CardHeader>
            <CardTitle>Alerts {alerts.length ? <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">{alerts.length}</span> : null}</CardTitle>
            <CardDescription>Balance due on orders ready to ship more than 2 days · ETA passed · approved RMA units not batched by Thursday · RMAs waiting more than 2 days for evidence.</CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length ? (
              <ul className="grid gap-1.5">
                {alerts.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex flex-wrap items-baseline gap-x-3 rounded-md px-2 py-1 text-sm hover:bg-muted/50" data-testid="alert">
                      <span className={cn("inline-block size-2 shrink-0 rounded-full", a.tone === "danger" ? "bg-red-600" : "bg-amber-500")} aria-hidden />
                      <span className="font-medium">{a.ref}</span>
                      <span className={cn(a.tone === "danger" ? "text-red-800" : "text-amber-900")}>{a.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Nothing overdue. </p>}
          </CardContent>
        </Card>

        <Card data-testid="rma-pending">
          <CardHeader>
            <CardTitle>RMAs pending shipment · {rmaPending} unit{rmaPending === 1 ? "" : "s"}</CardTitle>
            <CardDescription>
              Return to HK, not in a shipped batch.{ops_ ? ` Next Friday batch: ${dayMonth(ops.cutoff.date, "en")} ${ops.cutoff.time} Amsterdam · ${timeUntil(ops.cutoff.at, now)} left.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rmaRows.length ? (
              <ul className="grid gap-1.5 text-sm">
                {rmaRows.map((r) => (
                  <li key={r.k} className="flex justify-between gap-2">
                    <Link href={r.k === "direct" ? "/rmas" : "/rmas/batches"} className="hover:underline">{r.name}</Link>
                    <span className="tabular-nums text-muted-foreground">{r.inBatch} in batch · <span className={cn(r.toBatch && "font-medium text-foreground")}>{r.toBatch} to batch</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No unit waiting to go to Hong Kong.</p>}
          </CardContent>
        </Card>

        {role !== "account_specialist" ? (
          <Card data-testid="sales-month">
            <CardHeader>
              <CardTitle>Sales this month{role === "bd" ? " · your accounts" : ""}</CardTitle>
              <CardDescription>Invoice totals of orders invoiced or later, by order date.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1">
              <Link href="/sales" className="text-2xl font-semibold tabular-nums hover:underline">{money(salesThis)}</Link>
              <p className="text-sm text-muted-foreground">Last month {money(salesPrev)}</p>
            </CardContent>
          </Card>
        ) : null}

        {role !== "account_specialist" ? (
          <Card className={cn(role === "bd" && "lg:col-span-2")} data-testid="leads-by-stage">
            <CardHeader>
              <CardTitle>Leads by stage</CardTitle>
              <CardDescription>Open stages · {leads30} new in the last 30 days. Hover a bar for the tiers.</CardDescription>
            </CardHeader>
            <CardContent><BarList rows={leadRows} /></CardContent>
          </Card>
        ) : null}

        {role === "admin" ? (
          <Card data-testid="credit-notes">
            <CardHeader>
              <CardTitle>Credit-note spend</CardTitle>
              <CardDescription>Issued and applied credit notes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1">
              <Link href="/rmas/credit-notes" className="text-2xl font-semibold tabular-nums hover:underline">{money(cnMonth)}</Link>
              <p className="text-sm text-muted-foreground">This month · {money(cnYear)} this year</p>
            </CardContent>
          </Card>
        ) : null}

        <Card data-testid="queues">
          <CardHeader>
            <CardTitle>Today&apos;s routines</CardTitle>
            <CardDescription>SOP P5 and P9.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {ops_ ? <Link href="/dashboard/report" className="flex justify-between gap-2 hover:underline"><span>Daily report (Internal Orders + RMA&apos;s)</span><span className="text-muted-foreground">copy</span></Link> : null}
            <Link href="/dashboard/thursday" className="flex justify-between gap-2 hover:underline"><span>Thursday update</span><span className="tabular-nums text-muted-foreground">{thursdayTodo} to send</span></Link>
            <Link href="/dashboard/thursday#rma-ask" className="flex justify-between gap-2 hover:underline"><span>RMA ask (Tue/Wed)</span><span className="tabular-nums text-muted-foreground">{askTodo} to ask</span></Link>
            <Link href="/dashboard/escalations" className="flex justify-between gap-2 hover:underline"><span>Questions for the SD</span><span className="tabular-nums text-muted-foreground">{escalations.length} open</span></Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
