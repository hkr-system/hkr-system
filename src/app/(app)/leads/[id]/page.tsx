import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_TYPES, HEARD_ABOUT, VOLUME_RANGES, optionLabel } from "@/lib/leads/constants";
import { countryName, countryOptions } from "@/lib/leads/countries";
import { loadTeam } from "@/lib/leads/service";
import { formatDate, formatDateTime, shortZone } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { StageBadge, TierBadge } from "@/components/leads/badges";
import { LeadForm } from "@/components/leads/lead-form";
import { EventComposer, NextActionPanel, OwnerPanel, StagePanel } from "@/components/leads/lead-panels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateLead } from "../actions";

export const metadata: Metadata = { title: "Lead" };

const EVENT_LABELS: Record<string, string> = {
  created: "Created", stage_change: "Stage", owner_change: "Owner", note: "Note", contact: "Contact",
  form: "Form", import: "Import", email: "Email", whatsapp: "WhatsApp", brevo: "Brevo",
};

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const access = await checkSection("leads");
  if (!access.allowed) return <NoAccess />;
  const { user, readOnly } = access;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const db = await createClient();
  const [{ data: lead }, { data: events }, team] = await Promise.all([
    db.from("leads").select("*").eq("id", id).maybeSingle(),
    db.from("lead_events").select("id, kind, body, user_id, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(200),
    loadTeam(db),
  ]);
  if (!lead) notFound();
  const names = new Map(team.map((t) => [t.user_id, t.full_name]));
  const workers = team.filter((t) => t.role !== "account_specialist");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/leads/list" className="text-xs text-muted-foreground hover:underline">← All leads</Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight" data-testid="page-title">
            {lead.company} <TierBadge tier={lead.tier} disqualified={lead.disqualified} />
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StageBadge stage={lead.stage} />
            <span>{countryName(lead.country)}{lead.market ? ` · ${lead.market}` : ""}</span>
            <span>· Score {lead.score}</span>
            <span>· Source: {lead.source}</span>
          </p>
          {lead.disqualified ? (
            <p className="mt-2 text-sm text-destructive" data-testid="disqualified">Disqualified: {lead.disqualify_reason}</p>
          ) : null}
        </div>
        {readOnly ? <Badge variant="secondary">Read-only for your role</Badge> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid min-w-0 gap-6 content-start">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              {readOnly ? (
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {[
                    ["Contact", lead.contact_name], ["Title", lead.title], ["Email", lead.email], ["Phone", lead.phone_e164],
                    ["City", lead.city], ["Website", lead.website], ["Business type", optionLabel(BUSINESS_TYPES, lead.business_type)],
                    ["Volume", lead.volume_range ? optionLabel(VOLUME_RANGES, lead.volume_range) : lead.volume_units_month?.toString()],
                    ["Sells iPhones", lead.sells_iphones == null ? "Unknown" : lead.sells_iphones ? "Yes" : "No"],
                    ["Sells refurbished", lead.sells_refurbished == null ? "Unknown" : lead.sells_refurbished ? "Yes" : "No"],
                  ].map(([k, v]) => (
                    <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>
                  ))}
                </dl>
              ) : (
                <LeadForm action={updateLead} values={lead} countries={countryOptions()} submitLabel="Save details" showOptIns />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              {!readOnly ? <EventComposer id={lead.id} /> : null}
              <ol className="grid gap-3" data-testid="timeline">
                {(events ?? []).map((e) => (
                  <li key={e.id} className="grid grid-cols-[88px_1fr] gap-3 text-sm">
                    <span className="pt-0.5 text-xs font-medium text-muted-foreground uppercase">{EVENT_LABELS[e.kind] ?? e.kind}</span>
                    <div>
                      <p className="whitespace-pre-wrap">{e.body}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(e.created_at, user.timezone)} {shortZone(user.timezone)}
                        {e.user_id ? ` · ${names.get(e.user_id) ?? "—"}` : " · system"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardContent className="grid gap-5">
              {readOnly ? (
                <div className="grid gap-1 text-sm">
                  <span className="text-xs text-muted-foreground">Next action</span>
                  <span>{lead.next_action ?? "—"} {lead.next_action_date ? `(${formatDate(lead.next_action_date)})` : ""}</span>
                </div>
              ) : (
                <>
                  <StagePanel key={lead.stage} id={lead.id} stage={lead.stage} lostReason={lead.lost_reason} />
                  <NextActionPanel id={lead.id} text={lead.next_action} date={lead.next_action_date} />
                  <OwnerPanel id={lead.id} owner={lead.owner_user_id} team={workers} />
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Contact & email</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div><span className="text-xs text-muted-foreground">Heard about us: </span>{optionLabel(HEARD_ABOUT, lead.heard_about)}</div>
              <div><span className="text-xs text-muted-foreground">WhatsApp opt-in: </span>{lead.whatsapp_opt_in ? "Yes" : "No"}</div>
              <div><span className="text-xs text-muted-foreground">Email: </span>{lead.email_opt_out ? "Unsubscribed" : "Subscribed"}</div>
              <div><span className="text-xs text-muted-foreground">Brevo list: </span>{lead.brevo_list ?? "Not synced"}</div>
              <div><span className="text-xs text-muted-foreground">Created: </span>{formatDateTime(lead.created_at, user.timezone)}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
