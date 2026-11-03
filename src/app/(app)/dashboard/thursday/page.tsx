import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadOps } from "@/lib/dashboard/load";
import { dashboardTabs } from "@/lib/dashboard/tabs";
import { dayMonth, isoWeekday } from "@/lib/dashboard/dates";
import { rmaAskDraft, rmaAskQueue, thursdayDraft, thursdayQueue } from "@/lib/dashboard/updates";
import { formatDateTime } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { UpdateCard } from "@/components/dashboard/update-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Client updates" };

const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// SOP P5: the Thursday 3-line update to every client with an open order or open RMA, and the Tuesday/Wednesday RMA ask
// to every client of an EU intermediary. Drafts come from the records in the account's language; "Mark as sent" logs it.
export default async function ClientUpdatesPage() {
  const access = await checkSection("dashboard");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const db = await createClient();
  const [ops, { data: chats }, { data: dayRow }] = await Promise.all([
    loadOps(db),
    db.from("wa_conversations").select("id, account_id, last_message_at").not("account_id", "is", null).order("last_message_at", { ascending: false, nullsFirst: false }).limit(2000),
    db.from("settings").select("value").eq("key", "thursday_weekday").maybeSingle(),
  ]);
  const chatOf = new Map<string, string>();
  for (const c of chats ?? []) if (c.account_id && !chatOf.has(c.account_id)) chatOf.set(c.account_id, `/whatsapp?c=${c.id}`);
  const updateDay = Number(dayRow?.value) >= 1 && Number(dayRow?.value) <= 7 ? Number(dayRow?.value) : 4;
  const weekday = isoWeekday(ops.today);
  const sentWhen = (iso: string) => formatDateTime(iso, user.timezone);

  const queue = thursdayQueue(ops.accounts, ops.orders, ops.rmas, ops.updates, ops.week)
    .sort((a, b) => Number(Boolean(a.sent)) - Number(Boolean(b.sent)) || a.account.code.localeCompare(b.account.code));
  const done = queue.filter((q) => q.sent).length;
  const asks = rmaAskQueue(ops.intermediaries, ops.accounts, ops.updates, ops.week);
  const askTodo = asks.reduce((n, g) => n + g.clients.filter((c) => !c.sent).length, 0);

  return (
    <>
      <PageHeader title="Client updates" description={`Week of ${dayMonth(ops.week, "en")} (Hong Kong). Drafts are written from the order and RMA records in each client's language: check them, copy, send, then mark as sent.`} />
      <SectionTabs tabs={dashboardTabs(user.role)} />

      <Card className="mb-6" data-testid="thursday-queue">
        <CardHeader>
          <CardTitle>{WEEKDAY[updateDay]} update · {done} of {queue.length} sent</CardTitle>
          <CardDescription>
            {weekday === updateDay ? `Today is ${WEEKDAY[updateDay]}: every client below gets the 3-line update today.`
              : weekday < updateDay ? `Update day is ${WEEKDAY[updateDay]}. You can prepare and send earlier if Hong Kong gave news.`
              : `The update day has passed${queue.length - done ? ` — ${queue.length - done} still to send` : ""}.`}
            {" "}Three lines (SOP §3.3): status and dates as given by Hong Kong · next concrete news and when · what we need from the client, or “everything is in order with your units”.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 xl:grid-cols-2">
          {queue.length ? queue.map((q) => (
            <UpdateCard key={q.account.id} accountId={q.account.id} title={`${q.account.code} ${q.account.name}`} kind="thursday" lang={q.account.language}
              subtitle={[q.orders.length ? `${q.orders.length} order${q.orders.length === 1 ? "" : "s"}` : "", q.rmas.length ? `${q.rmas.length} RMA${q.rmas.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
              draft={thursdayDraft({ lang: q.account.language, today: ops.today, orders: q.orders, rmas: q.rmas })}
              orderIds={q.orders.map((o) => o.id)} sent={q.sent ? { id: q.sent.id!, when: sentWhen(q.sent.sent_at) } : null}
              chatHref={chatOf.get(q.account.id) ?? null} accountHref={`/accounts/${q.account.id}`} />
          )) : <p className="text-sm text-muted-foreground">No client has an open order or an open RMA.</p>}
        </CardContent>
      </Card>

      <Card id="rma-ask" className="scroll-mt-20" data-testid="rma-ask-queue">
        <CardHeader>
          <CardTitle>RMA ask · Tuesday / Wednesday {askTodo ? `· ${askTodo} to send` : ""}</CardTitle>
          <CardDescription>
            Ask every client of each EU intermediary whether they have RMAs this week (SOP P11). Next cut-off: Friday {dayMonth(ops.cutoff.date, "en")} {ops.cutoff.time} Amsterdam time.
            {weekday === 2 || weekday === 3 ? " Today is the day to ask." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {asks.length ? asks.map((g) => (
            <div key={g.intermediary.id} className="grid gap-3">
              <h3 className="text-sm font-semibold">{g.intermediary.name} <span className="font-normal text-muted-foreground">· {g.clients.length} client{g.clients.length === 1 ? "" : "s"}</span></h3>
              <div className="grid gap-3 xl:grid-cols-2">
                {g.clients.map((c) => (
                  <UpdateCard key={c.account.id} accountId={c.account.id} title={`${c.account.code} ${c.account.name}`} kind="rma_ask" lang={c.account.language}
                    draft={rmaAskDraft({ lang: c.account.language, intermediary: g.intermediary.name, cutoffDate: ops.cutoff.date, cutoffTime: ops.cutoff.time })}
                    orderIds={[]} sent={c.sent ? { id: c.sent.id!, when: sentWhen(c.sent.sent_at) } : null}
                    chatHref={chatOf.get(c.account.id) ?? null} accountHref={`/accounts/${c.account.id}`} />
                ))}
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">No active client imports through an EU intermediary.</p>}
        </CardContent>
      </Card>
    </>
  );
}
