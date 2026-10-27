import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STAGES, STAGES, TIERS, MARKETS, type LeadStage, type LeadTier, type Market } from "@/lib/leads/constants";
import { countryName } from "@/lib/leads/countries";
import { loadTeam } from "@/lib/leads/service";
import { formatDate, todayIn } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { StageBadge, TierBadge } from "@/components/leads/badges";
import { LeadFilters } from "@/components/leads/lead-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "All leads" };

const PAGE_SIZE = 50;

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function LeadsListPage({ searchParams }: PageProps<"/leads/list">) {
  const access = await checkSection("leads");
  if (!access.allowed) return <NoAccess />;
  const { user, readOnly } = access;
  const sp = await searchParams;
  const p = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const page = Math.max(1, Number(p("page")) || 1);
  const today = todayIn(user.timezone);

  const db = await createClient();
  let query = db
    .from("leads")
    .select("id, company, contact_name, country, market, stage, tier, score, disqualified, owner_user_id, next_action, next_action_date, source, updated_at", { count: "exact" });

  const q = p("q").replace(/[%,()]/g, " ").trim();
  if (q) query = query.or(`company.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%,city.ilike.%${q}%`);
  const stage = p("stage");
  if (stage === "open") query = query.in("stage", OPEN_STAGES);
  else if ((STAGES as readonly string[]).includes(stage)) query = query.eq("stage", stage as LeadStage);
  const tier = p("tier");
  if (tier === "dq") query = query.eq("disqualified", true);
  else if ((TIERS as readonly string[]).includes(tier)) query = query.eq("tier", tier as LeadTier).eq("disqualified", false);
  const market = p("market");
  if ((MARKETS as readonly string[]).includes(market)) query = query.eq("market", market as Market);
  const owner = p("owner");
  if (owner === "me") query = query.eq("owner_user_id", user.id);
  else if (owner === "none") query = query.is("owner_user_id", null);
  else if (/^[0-9a-f-]{36}$/.test(owner)) query = query.eq("owner_user_id", owner);
  if (p("source")) query = query.eq("source", p("source"));
  const due = p("due");
  if (due === "overdue") query = query.lt("next_action_date", today);
  else if (due === "today") query = query.lte("next_action_date", today);
  else if (due === "week") query = query.lte("next_action_date", addDays(today, 7));
  else if (due === "none") query = query.is("next_action_date", null);

  const [{ data: leads, count }, team, { data: sourceRows }] = await Promise.all([
    query.order("updated_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    loadTeam(db),
    db.from("leads").select("source").limit(5000),
  ]);
  const names = new Map(team.map((t) => [t.user_id, t.full_name]));
  const sources = [...new Set((sourceRows ?? []).map((r) => r.source))].sort();
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const pageHref = (n: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    next.set("page", String(n));
    return `/leads/list?${next.toString()}`;
  };

  return (
    <>
      <PageHeader title="All leads" description={`${count ?? 0} leads match.`}>
        {readOnly ? <Badge variant="secondary">Read-only for your role</Badge> : (
          <Button asChild size="sm"><Link href="/leads/new">New lead</Link></Button>
        )}
      </PageHeader>
      <LeadFilters team={team.filter((t) => t.role !== "account_specialist")} sources={sources} />
      <Card>
        <CardContent className="px-0">
          <Table data-testid="leads-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">Tier</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(leads ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="pl-4"><TierBadge tier={l.tier} disqualified={l.disqualified} /></TableCell>
                  <TableCell>
                    <Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.company}</Link>
                    {l.contact_name ? <span className="block text-xs text-muted-foreground">{l.contact_name}</span> : null}
                  </TableCell>
                  <TableCell>{countryName(l.country)}{l.market ? <span className="ml-1 text-xs text-muted-foreground">{l.market}</span> : null}</TableCell>
                  <TableCell><StageBadge stage={l.stage} /></TableCell>
                  <TableCell>{l.owner_user_id ? names.get(l.owner_user_id) ?? "—" : <span className="text-muted-foreground">No owner</span>}</TableCell>
                  <TableCell className="max-w-56">
                    {l.next_action_date ? (
                      <span className={l.next_action_date < today ? "text-destructive" : ""}>
                        {formatDate(l.next_action_date)}
                        <span className="block truncate text-xs text-muted-foreground">{l.next_action}</span>
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.source}</TableCell>
                </TableRow>
              ))}
              {!leads?.length ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No leads match these filters.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page - 1)}>Previous</Link></Button> : null}
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          {page < pages ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page + 1)}>Next</Link></Button> : null}
        </div>
      ) : null}
    </>
  );
}
