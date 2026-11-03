import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brevoEnabled } from "@/lib/brevo";
import { loadOps } from "@/lib/dashboard/load";
import { dashboardTabs } from "@/lib/dashboard/tabs";
import { dayMonth, usd } from "@/lib/dashboard/dates";
import { balancePending, ordersReport, reportText, rmaReport } from "@/lib/dashboard/report";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { CopyButton } from "@/components/dashboard/copy-button";
import { ReminderButton } from "@/components/dashboard/reminder-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Daily report" };

// SOP P9: Internal Orders and Internal RMA's, exact SOP format, every open item every day ("none" when empty).
// Same text as the 18:00 HK email (admin + specialist). Brief §8: admin and specialist, not bd.
export default async function DailyReportPage() {
  const access = await checkSection("dashboard");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  if (user.role === "bd") return <NoAccess />;
  const db = await createClient();
  const [ops, { data: timeRow }, { data: lastRow }] = await Promise.all([
    loadOps(db),
    db.from("settings").select("value").eq("key", "report_time").maybeSingle(),
    db.from("settings").select("value").eq("key", "last_daily_report").maybeSingle(),
  ]);
  const orders = ordersReport(ops.orders);
  const rmas = rmaReport(ops.rmas, ops.today);
  const ordersText = reportText(orders);
  const rmaText = reportText(rmas);
  const time = (timeRow?.value as { time?: string } | null)?.time ?? "18:00";
  const last = typeof lastRow?.value === "string" ? lastRow.value : null;
  const pending = ops.orders.filter((o) => o.status === "ready_to_ship" && !o.balance_ok)
    .sort((a, b) => a.account_code.localeCompare(b.account_code) || a.number.localeCompare(b.number, undefined, { numeric: true }));

  return (
    <>
      <PageHeader title="Daily report" description={`${dayMonth(ops.today, "en")} (Hong Kong). Read from the records, never from memory: update orders and RMAs first, then copy each block into its WhatsApp group.`} />
      <SectionTabs tabs={dashboardTabs(user.role)} />
      <p className="mb-4 text-sm text-muted-foreground" data-testid="report-email-status">
        {brevoEnabled()
          ? `Emailed to the admin and the specialist at ${time} Hong Kong time on working days${last ? ` · last sent ${dayMonth(last, "en")}` : ""}.`
          : `The ${time} Hong Kong email starts when Brevo is connected (BREVO_API_KEY). Until then, copy the blocks below.`}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="report-orders">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div><CardTitle>Internal Orders — daily</CardTitle><CardDescription>Open orders · ready to ship · pending balances</CardDescription></div>
            <CopyButton text={ordersText} testId="copy-orders" />
          </CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap" data-testid="report-orders-text">{ordersText}</pre></CardContent>
        </Card>
        <Card data-testid="report-rmas">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div><CardTitle>Internal RMA&apos;s — daily</CardTitle><CardDescription>Open RMAs by client, batch and pieces · closed today</CardDescription></div>
            <CopyButton text={rmaText} testId="copy-rmas" />
          </CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap" data-testid="report-rmas-text">{rmaText}</pre></CardContent>
        </Card>
      </div>

      <Card className="mt-4" data-testid="balance-reminders">
        <CardHeader>
          <CardTitle>Pending balances — reminders</CardTitle>
          <CardDescription>When you remind a client of a balance, mark it here: the report then says “reminded dd-mmm (1st / 2nd)”. Never type bank details in the reminder.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {pending.length ? pending.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 text-sm last:border-0">
              <Link href={`/orders/${o.id}`} className="font-medium hover:underline">{o.account_code} {o.number}</Link>
              <span className="tabular-nums">{usd(balancePending(o))}</span>
              <span className="text-xs text-muted-foreground">{o.reminders.length ? `${o.reminders.length} reminder${o.reminders.length === 1 ? "" : "s"}, last ${dayMonth(o.reminders.at(-1)!, "en")}` : "not reminded yet"}</span>
              <span className="ml-auto"><ReminderButton accountId={o.account_id} orderId={o.id} done={o.reminders.includes(ops.today)} /></span>
            </div>
          )) : <p className="text-sm text-muted-foreground">No balance pending on orders ready to ship.</p>}
        </CardContent>
      </Card>
    </>
  );
}
