import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STAGES } from "@/lib/leads/constants";
import { loadTeam } from "@/lib/leads/service";
import { daysAgoIso, todayIn } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { LeadBoard } from "@/components/leads/lead-board";
import { NativeSelectLink } from "@/components/leads/board-filter";

export const metadata: Metadata = { title: "Board · Leads" };

export default async function BoardPage({ searchParams }: PageProps<"/leads/board">) {
  const access = await checkSection("leads");
  if (!access.allowed || access.readOnly) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const mine = sp.owner !== "all";
  const db = await createClient();
  const since = daysAgoIso(30);

  let open = db.from("leads").select("id, company, country, tier, disqualified, stage, owner_user_id, next_action_date")
    .in("stage", OPEN_STAGES).order("tier").limit(500);
  let closed = db.from("leads").select("id, company, country, tier, disqualified, stage, owner_user_id, next_action_date")
    .in("stage", ["Won", "Lost"]).gte("stage_changed_at", since).limit(200);
  if (mine) {
    open = open.or(`owner_user_id.eq.${user.id},owner_user_id.is.null`);
    closed = closed.eq("owner_user_id", user.id);
  }
  const [{ data: a }, { data: b }, team] = await Promise.all([open, closed, loadTeam(db)]);
  const initials = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\(.*\)/, "").trim().split(/\s+/)[0]]));
  const leads = [...(a ?? []), ...(b ?? [])].map((l) => ({
    id: l.id, company: l.company, country: l.country, tier: l.tier, disqualified: l.disqualified, stage: l.stage,
    owner: l.owner_user_id ? initials.get(l.owner_user_id) ?? null : null, next_action_date: l.next_action_date,
  }));

  return (
    <>
      <PageHeader title="Board" description="Drag a card to change its stage. Won and Lost show the last 30 days.">
        <NativeSelectLink value={mine ? "mine" : "all"} />
      </PageHeader>
      <LeadBoard key={mine ? "mine" : "all"} initial={leads} today={todayIn(user.timezone)} />
    </>
  );
}
