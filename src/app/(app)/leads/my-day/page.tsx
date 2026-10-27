import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STAGES } from "@/lib/leads/constants";
import { countryName } from "@/lib/leads/countries";
import { formatDate, formatDateTime, todayIn } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { StageBadge, TierBadge } from "@/components/leads/badges";
import { ReviewedButton, TakeLeadButton } from "@/components/leads/lead-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "My day · Leads" };

const LEAD_COLS = "id, company, country, stage, tier, disqualified, next_action, next_action_date, owner_user_id, stage_changed_at, last_touch_at";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export default async function MyDayPage() {
  const access = await checkSection("leads");
  if (!access.allowed) return <NoAccess />;
  if (access.readOnly) redirect("/leads");
  const { user } = access;
  const db = await createClient();
  const today = todayIn(user.timezone);

  const [due, replied, unassigned, submissions] = await Promise.all([
    db.from("leads").select(LEAD_COLS).eq("owner_user_id", user.id).in("stage", OPEN_STAGES)
      .lte("next_action_date", today).order("next_action_date").limit(100),
    db.from("leads").select(LEAD_COLS).eq("stage", "Replied")
      .or(`owner_user_id.eq.${user.id},owner_user_id.is.null`).order("stage_changed_at").limit(100),
    db.from("leads").select(LEAD_COLS, { count: "exact" }).is("owner_user_id", null).in("stage", OPEN_STAGES)
      .eq("disqualified", false).order("tier").order("created_at", { ascending: false }).limit(10),
    db.from("lead_form_submissions")
      .select("id, submitted_at, computed_score, tier, disqualified, merged, lead_id, raw, leads(company, country, stage)")
      .is("reviewed_at", null).order("submitted_at", { ascending: false }).limit(50),
  ]);

  // "Replied" leads nobody answered: no contact logged since they replied.
  const waiting = (replied.data ?? []).filter(
    (l) => !l.last_touch_at || new Date(l.last_touch_at) < new Date(l.stage_changed_at),
  );

  return (
    <>
      <PageHeader title="My day" description={`Your leads to work today (${formatDate(today)}).`}>
        <Button asChild size="sm"><Link href="/leads/new">New lead</Link></Button>
      </PageHeader>

      <div className="grid gap-6">
        <Card data-testid="myday-due">
          <CardHeader>
            <CardTitle>Next actions due <Badge variant="secondary" className="ml-1">{due.data?.length ?? 0}</Badge></CardTitle>
            <CardDescription>Your leads with a next action for today or earlier.</CardDescription>
          </CardHeader>
          <CardContent>
            {due.data?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead><TableHead>Next action</TableHead><TableHead>Due</TableHead><TableHead>Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {due.data.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium"><Link className="hover:underline" href={`/leads/${l.id}`}>{l.company}</Link></TableCell>
                      <TableCell className="max-w-xs truncate">{l.next_action ?? "—"}</TableCell>
                      <TableCell className={l.next_action_date! < today ? "font-medium text-destructive" : ""}>
                        {l.next_action_date! < today ? `Overdue · ${formatDate(l.next_action_date)}` : "Today"}
                      </TableCell>
                      <TableCell><StageBadge stage={l.stage} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <Empty>Nothing due. Well done.</Empty>}
          </CardContent>
        </Card>

        <Card data-testid="myday-replied">
          <CardHeader>
            <CardTitle>Replies waiting for an answer <Badge variant="secondary" className="ml-1">{waiting.length}</Badge></CardTitle>
            <CardDescription>Leads in “Replied” (yours or unassigned) with no contact logged since they replied.</CardDescription>
          </CardHeader>
          <CardContent>
            {waiting.length ? (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Company</TableHead><TableHead>Replied</TableHead><TableHead>Owner</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {waiting.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium"><Link className="hover:underline" href={`/leads/${l.id}`}>{l.company}</Link></TableCell>
                      <TableCell>{formatDateTime(l.stage_changed_at, user.timezone)}</TableCell>
                      <TableCell>{l.owner_user_id ? "You" : <TakeLeadButton id={l.id} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <Empty>No replies waiting.</Empty>}
          </CardContent>
        </Card>

        <Card data-testid="myday-submissions">
          <CardHeader>
            <CardTitle>New form submissions <Badge variant="secondary" className="ml-1">{submissions.data?.length ?? 0}</Badge></CardTitle>
            <CardDescription>From the public /apply form, not yet reviewed. Seen by the whole BD team.</CardDescription>
          </CardHeader>
          <CardContent>
            {submissions.data?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead><TableHead>Country</TableHead><TableHead>Tier</TableHead>
                    <TableHead className="text-right">Score</TableHead><TableHead>Received</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.data.map((s) => {
                    const lead = Array.isArray(s.leads) ? s.leads[0] : s.leads;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          {s.lead_id ? <Link className="hover:underline" href={`/leads/${s.lead_id}`}>{lead?.company ?? "Lead"}</Link> : "—"}
                          {s.merged ? <Badge variant="outline" className="ml-2">existing lead</Badge> : null}
                        </TableCell>
                        <TableCell>{countryName(lead?.country)}</TableCell>
                        <TableCell><TierBadge tier={s.tier} disqualified={s.disqualified} /></TableCell>
                        <TableCell className="text-right tabular-nums">{s.computed_score}</TableCell>
                        <TableCell>{formatDateTime(s.submitted_at, user.timezone)}</TableCell>
                        <TableCell className="text-right"><ReviewedButton id={s.id} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : <Empty>No new submissions.</Empty>}
          </CardContent>
        </Card>

        <Card data-testid="myday-unassigned">
          <CardHeader>
            <CardTitle>Leads without an owner <Badge variant="secondary" className="ml-1">{unassigned.count ?? 0}</Badge></CardTitle>
            <CardDescription>Open, not disqualified, nobody assigned. Best tiers first.</CardDescription>
          </CardHeader>
          <CardContent>
            {unassigned.data?.length ? (
              <Table>
                <TableBody>
                  {unassigned.data.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="w-8"><TierBadge tier={l.tier} /></TableCell>
                      <TableCell className="font-medium"><Link className="hover:underline" href={`/leads/${l.id}`}>{l.company}</Link></TableCell>
                      <TableCell>{countryName(l.country)}</TableCell>
                      <TableCell><StageBadge stage={l.stage} /></TableCell>
                      <TableCell className="text-right"><TakeLeadButton id={l.id} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <Empty>Every open lead has an owner.</Empty>}
            {(unassigned.count ?? 0) > 10 ? (
              <div className="pt-3 text-right">
                <Link href="/leads/list?owner=none" className="text-sm text-muted-foreground hover:underline">See all {unassigned.count} →</Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
