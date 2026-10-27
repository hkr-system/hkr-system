import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STAGES, STAGES, type LeadStage } from "@/lib/leads/constants";
import { countryName } from "@/lib/leads/countries";
import { loadTeam } from "@/lib/leads/service";
import { daysAgoIso, formatDate, todayIn } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { StageBadge, TierBadge } from "@/components/leads/badges";
import { PeriodSelect } from "@/components/leads/period-select";
import { ShareFormDialog } from "@/components/leads/share-form-dialog";
import { BarList, Funnel, StatTile } from "@/components/viz";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Leads overview" };

const PERIODS: Record<string, number | null> = { "30": 30, "90": 90, "365": 365, all: null };
// "Closest to convert" (Oct 2026): furthest stage first, then tier, then score.
const ADVANCED: LeadStage[] = ["Sample/Proposal", "Meeting", "Qualified"];

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.parse(todayIn("UTC")) - Date.parse(iso.slice(0, 10))) / 86400_000));
}

export default async function LeadsOverviewPage({ searchParams }: PageProps<"/leads">) {
  const access = await checkSection("leads");
  if (!access.allowed) return <NoAccess />;
  const { user, readOnly } = access;
  const sp = await searchParams;
  const period = typeof sp.period === "string" && sp.period in PERIODS ? sp.period : "90";
  const days = PERIODS[period];
  const since = days ? daysAgoIso(days) : null;
  const today = todayIn(user.timezone);
  const db = await createClient();

  const [funnel, open, recent, advanced, overdue, won, team, subs, convs, baseUrlRow] = await Promise.all([
    db.rpc("lead_funnel", { p_since: since ?? undefined }),
    db.from("leads").select("id, stage, tier, market, source, owner_user_id, last_touch_at, stage_changed_at")
      .in("stage", OPEN_STAGES).eq("disqualified", false).limit(10000),
    db.from("leads").select("created_at").gte("created_at", daysAgoIso(14)).limit(10000),
    db.from("leads").select("id, company, country, stage, tier, score, owner_user_id, next_action, next_action_date, stage_changed_at")
      .in("stage", ADVANCED).eq("disqualified", false)
      .order("stage", { ascending: false }).order("tier").order("score", { ascending: false }).limit(10),
    db.from("leads").select("id, company, owner_user_id, next_action, next_action_date", { count: "exact" })
      .in("stage", OPEN_STAGES).lt("next_action_date", today).order("next_action_date").limit(6),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "Won").gte("stage_changed_at", daysAgoIso(30)),
    loadTeam(db),
    readOnly ? Promise.resolve({ count: null }) : db.from("lead_form_submissions").select("id", { count: "exact", head: true }).is("reviewed_at", null),
    db.from("wa_conversations").select("last_inbound_at, last_outbound_at, status").neq("status", "resolved").limit(2000),
    db.from("settings").select("value").eq("key", "app_base_url").maybeSingle(),
  ]);
  const baseUrl = typeof baseUrlRow.data?.value === "string" && baseUrlRow.data.value ? baseUrlRow.data.value : "https://hkr-system.vercel.app";
  const sharers = team.filter((m) => m.role === "admin" || m.role === "bd").map((m) => ({ user_id: m.user_id, full_name: m.full_name }));

  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));
  const openRows = open.data ?? [];
  const weekAgo = Date.parse(daysAgoIso(7));
  const newThisWeek = (recent.data ?? []).filter((l) => Date.parse(l.created_at) >= weekAgo).length;
  const newPrevWeek = (recent.data ?? []).length - newThisWeek;
  const repliesWaiting = openRows.filter((l) => l.stage === "Replied" && (!l.last_touch_at || l.last_touch_at < l.stage_changed_at)).length;
  const unassigned = openRows.filter((l) => !l.owner_user_id).length;
  const unansweredWa = (convs.data ?? []).filter((c) => c.last_inbound_at && (!c.last_outbound_at || c.last_inbound_at > c.last_outbound_at)).length;
  const advancedCount = openRows.filter((l) => (ADVANCED as string[]).includes(l.stage)).length;

  const funnelRows = (funnel.data ?? []).filter((r) => r.stage !== "Lost")
    .map((r) => ({ ...r, href: `/leads/list?stage=${encodeURIComponent(r.stage)}` }));
  const lost = (funnel.data ?? []).find((r) => r.stage === "Lost")?.current ?? 0;

  const count = <K extends string>(key: (l: (typeof openRows)[number]) => K | null) => {
    const m = new Map<string, number>();
    for (const l of openRows) { const k = key(l) ?? "—"; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byTier = ["A", "B", "C"].map((t) => ({ label: `Tier ${t}`, value: openRows.filter((l) => l.tier === t).length, href: `/leads/list?stage=open&tier=${t}` }));
  const byMarket = count((l) => l.market).map(([k, v]) => ({ label: k, value: v, href: k === "—" ? undefined : `/leads/list?stage=open&market=${k}` }));
  const bySource = count((l) => l.source).slice(0, 6).map(([k, v]) => ({ label: k, value: v, href: `/leads/list?stage=open&source=${encodeURIComponent(k)}` }));
  const byOwner = count((l) => (l.owner_user_id ? names.get(l.owner_user_id) ?? "—" : "No owner")).map(([k, v]) => ({ label: k, value: v }));

  return (
    <>
      <PageHeader title="Leads overview" description="Where the pipeline stands and what needs action today.">
        <div className="flex items-center gap-2">
          <PeriodSelect value={period} />
          {!readOnly ? <ShareFormDialog baseUrl={baseUrl} owners={sharers} currentUserId={user.id} /> : null}
          {!readOnly ? <Button asChild size="sm"><Link href="/leads/new">New lead</Link></Button> : null}
        </div>
      </PageHeader>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="kpis">
          <StatTile label="Open leads" value={openRows.length} href="/leads/list?stage=open" sub="not Won/Lost, not disqualified" />
          <StatTile label="New this week" value={newThisWeek} href="/leads/list"
            sub={newPrevWeek ? `${newThisWeek >= newPrevWeek ? "▲" : "▼"} vs ${newPrevWeek} the week before` : "none the week before"} />
          <StatTile label="Close to converting" value={advancedCount} sub="Qualified, Meeting, Sample/Proposal" href="#closest" />
          <StatTile label="Won (30 days)" value={won.count ?? 0} href="/leads/list?stage=Won" />
          <StatTile label="Overdue next actions" value={overdue.count ?? 0} tone="attention" href="/leads/list?due=overdue&stage=open" />
          <StatTile label="Unanswered WhatsApp" value={unansweredWa} tone="attention" href="/whatsapp?view=unanswered" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Funnel</CardTitle>
              <CardDescription>
                Leads that reached each stage{days ? ` (created in the last ${days} days)` : ""}; % = share of the stage before. Lost now: {lost}. Disqualified leads are left out.
              </CardDescription>
            </CardHeader>
            <CardContent><Funnel rows={funnelRows} /></CardContent>
          </Card>

          <Card data-testid="needs-action">
            <CardHeader>
              <CardTitle>Needs action</CardTitle>
              <CardDescription>Click a line to open the filtered list.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Replies waiting" value={repliesWaiting} tone="attention" href="/leads/list?stage=Replied" />
                <StatTile label="Without owner" value={unassigned} tone="attention" href="/leads/list?owner=none&stage=open" />
                {!readOnly ? <StatTile label="Forms to review" value={subs.count ?? 0} tone="attention" href="/leads/my-day" /> : null}
                <StatTile label="Overdue actions" value={overdue.count ?? 0} tone="attention" href="/leads/list?due=overdue&stage=open" />
              </div>
              {overdue.data?.length ? (
                <ul className="grid gap-1 text-sm">
                  {overdue.data.map((l) => (
                    <li key={l.id}>
                      <Link href={`/leads/${l.id}`} className="grid grid-cols-[1fr_auto] gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                        <span className="truncate"><span className="font-medium">{l.company}</span>
                          <span className="text-muted-foreground"> · {l.next_action ?? "next action"}</span></span>
                        <span className="text-xs text-destructive">{formatDate(l.next_action_date)}{l.owner_user_id ? ` · ${names.get(l.owner_user_id) ?? ""}` : ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">No overdue actions.</p>}
            </CardContent>
          </Card>
        </div>

        <Card id="closest" data-testid="closest">
          <CardHeader>
            <CardTitle>Closest to converting</CardTitle>
            <CardDescription>Sample/Proposal first, then Meeting, then Qualified; within each, best tier and score.</CardDescription>
          </CardHeader>
          <CardContent>
            {advanced.data?.length ? (
              <ul className="divide-y">
                {advanced.data.map((l) => {
                  const late = l.next_action_date && l.next_action_date < today;
                  return (
                    <li key={l.id}>
                      <Link href={`/leads/${l.id}`} className="grid grid-cols-[24px_1fr] items-center gap-3 py-2 hover:bg-muted/40 sm:grid-cols-[24px_1.4fr_auto_1.6fr_auto]">
                        <TierBadge tier={l.tier} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{l.company}</span>
                          <span className="block text-xs text-muted-foreground">{countryName(l.country)} · score {l.score} · {daysSince(l.stage_changed_at)} days in stage</span>
                        </span>
                        <StageBadge stage={l.stage} className="hidden sm:inline-flex" />
                        <span className={`hidden truncate text-xs sm:block ${late ? "text-destructive" : "text-muted-foreground"}`}>
                          {l.next_action ? `${l.next_action} · ${formatDate(l.next_action_date)}` : "No next action set"}
                        </span>
                        <span className="hidden text-right text-xs text-muted-foreground sm:block">{l.owner_user_id ? names.get(l.owner_user_id) : "No owner"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="py-4 text-center text-sm text-muted-foreground">No leads in Qualified, Meeting or Sample/Proposal yet.</p>}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card><CardHeader><CardTitle className="text-sm">Open leads by tier</CardTitle></CardHeader><CardContent><BarList rows={byTier} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">By market</CardTitle></CardHeader><CardContent><BarList rows={byMarket} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">By source</CardTitle></CardHeader><CardContent><BarList rows={bySource} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">By owner</CardTitle></CardHeader><CardContent><BarList rows={byOwner} /></CardContent></Card>
        </div>
        <p className="text-xs text-muted-foreground">
          Stages in order: {STAGES.join(" → ")}. Every number links to the matching list.
        </p>
      </div>
    </>
  );
}
