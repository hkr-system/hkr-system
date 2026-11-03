import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { dashboardTabs } from "@/lib/dashboard/tabs";
import { DECIDE_RULE, TOPIC_LABEL, escalationText, type Topic } from "@/lib/dashboard/escalations";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { CopyButton } from "@/components/dashboard/copy-button";
import { DecideForm, EscalationForm } from "@/components/dashboard/escalation-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "For the SD" };

// SOP P8 / §3.5: questions the specialist (or bd) does not decide alone go to the SD here, in the SOP order.
// Only an admin answers and closes (database trigger). RLS: everyone sees the escalations of the accounts they can see.
export default async function EscalationsPage({ searchParams }: PageProps<"/dashboard/escalations">) {
  const access = await checkSection("dashboard");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const show = sp.status === "closed" ? "closed" : "open";
  const db = await createClient();
  const [{ data: rows }, { data: accounts }, { data: orders }, { data: people }, { count: openCount }] = await Promise.all([
    db.from("escalations").select("*, accounts(code, name), orders(number, total_usd)").eq("status", show)
      .order(show === "open" ? "answer_by" : "decided_at", { ascending: show === "open", nullsFirst: false }).limit(200),
    db.from("accounts").select("id, code, name").neq("status", "closed").order("code"),
    db.from("orders").select("id, account_id, number, status").not("status", "in", "(closed)").order("order_date", { ascending: false }).limit(2000),
    db.from("profiles").select("user_id, full_name, email"),
    db.from("escalations").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const name = new Map((people ?? []).map((p) => [p.user_id, p.full_name || p.email]));
  const now = new Date().toISOString();
  const account = typeof sp.account === "string" ? sp.account : undefined;
  const order = typeof sp.order === "string" ? sp.order : undefined;

  return (
    <>
      <PageHeader title="For the SD" description="Escalations to the Sales Director (SOP P8): one message with the facts, in the SOP order. The SD answers here; the author is told in the bell." />
      <SectionTabs tabs={dashboardTabs(user.role)} />

      <Card className="mb-4 border-amber-200 bg-amber-50/40" data-testid="decide-rule">
        <CardContent className="grid gap-1.5 py-4 text-sm">
          <p><strong>Decide alone or prepare for the SD?</strong></p>
          <p>{DECIDE_RULE.answer}</p>
          <p>{DECIDE_RULE.escalate}</p>
          <p className="text-muted-foreground">{DECIDE_RULE.meanwhile}</p>
        </CardContent>
      </Card>

      <details className="mb-6 rounded-xl border bg-card" open={Boolean(account)} data-testid="new-escalation">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">+ Prepare a question for the SD</summary>
        <div className="border-t p-4">
          <EscalationForm defaults={{ account, order }}
            accounts={(accounts ?? []).map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))}
            orders={(orders ?? []).map((o) => ({ id: o.id, account_id: o.account_id, label: o.number }))} />
        </div>
      </details>

      <div className="mb-3 flex gap-2 text-sm">
        <Link href="/dashboard/escalations" className={cn("rounded-full border px-3 py-1", show === "open" && "bg-foreground text-background")}>Open ({openCount ?? 0})</Link>
        <Link href="/dashboard/escalations?status=closed" className={cn("rounded-full border px-3 py-1", show === "closed" && "bg-foreground text-background")}>Answered</Link>
      </div>

      <div className="grid gap-3" data-testid="escalation-list">
        {(rows ?? []).length ? (rows ?? []).map((e) => {
          const acc = e.accounts as unknown as { code: string; name: string } | null;
          const ord = e.orders as unknown as { number: string; total_usd: number } | null;
          const late = e.status === "open" && e.answer_by && e.answer_by < now;
          const msg = escalationText({
            client: `${acc?.code ?? ""} ${acc?.name ?? ""}`.trim(), order: ord?.number ?? null, invoiceValue: ord ? Number(ord.total_usd) : null,
            what_happened: e.what_happened, evidence: e.evidence, figures: e.figures, client_asks: e.client_asks, proposal: e.proposal,
            answer_by: e.answer_by ? `${formatDateTime(e.answer_by, "Asia/Hong_Kong")} HK · ${formatDateTime(e.answer_by, "America/El_Salvador")} SV` : null,
          });
          return (
            <Card key={e.id} id={`e-${e.id}`} className={cn("scroll-mt-20", late && "border-red-300")} data-testid="escalation">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base">
                    <Link href={`/accounts/${e.account_id}`} className="hover:underline">{acc?.code}</Link> · {TOPIC_LABEL[e.topic as Topic] ?? e.topic}
                  </CardTitle>
                  <CardDescription>
                    By {name.get(e.created_by ?? "") ?? "—"} · {formatDateTime(e.created_at, user.timezone)}
                    {e.answer_by ? <> · <span className={cn(late && "font-medium text-red-700")}>{late ? "answer was due" : "answer by"} {formatDateTime(e.answer_by, user.timezone)}</span></> : null}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {e.status === "closed" ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Answered</Badge> : <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Waiting for the SD</Badge>}
                  <CopyButton text={msg} label="Copy for the SD" />
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap">{msg}</pre>
                {e.decision ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm" data-testid="decision">
                    <span className="font-medium">SD decision{e.decided_by ? ` (${name.get(e.decided_by) ?? ""}${e.decided_at ? `, ${formatDateTime(e.decided_at, user.timezone)}` : ""})` : ""}:</span> {e.decision}
                  </div>
                ) : null}
                {user.role === "admin" ? <DecideForm id={e.id} decision={e.decision} closed={e.status === "closed"} /> : null}
              </CardContent>
            </Card>
          );
        }) : <p className="text-sm text-muted-foreground">{show === "open" ? "Nothing waiting for the SD." : "No answered escalations yet."}</p>}
      </div>
    </>
  );
}
