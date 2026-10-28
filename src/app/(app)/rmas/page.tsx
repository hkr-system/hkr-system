import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { money } from "@/lib/orders/constants";
import { RMA_NEXT_ACTION, RMA_STATUSES, type RmaStatus } from "@/lib/rmas/constants";
import { cutoffInfo, type CutoffSetting } from "@/lib/rmas/cutoff";
import { rmaTabs } from "@/lib/rmas/tabs";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { RmaFilters } from "@/components/rmas/rma-filters";
import { Flag, RmaStatusBadge } from "@/components/rmas/badges";
import { RealtimeRefresh } from "@/components/whatsapp/realtime-refresh";
import { StatTile } from "@/components/viz";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "RMAs" };

const CHANNEL = { portal: "Portal", internal: "Team", import: "xlsx" } as const;

export default async function RmasPage({ searchParams }: PageProps<"/rmas">) {
  const access = await checkSection("rmas");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const p = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const db = await createClient();

  let query = db.from("rma_overview").select("*").order("created_at", { ascending: false }).limit(500);
  const status = p("status");
  if (!status) query = query.neq("status", "closed");
  else if (status !== "all" && RMA_STATUSES.includes(status as RmaStatus)) query = query.eq("status", status as RmaStatus);
  if (p("account")) query = query.eq("account_id", p("account"));
  if (p("channel")) query = query.eq("channel", p("channel") as "portal");
  const q = p("q");
  if (q) {
    if (/^\d{4,15}$/.test(q)) {
      const { data: hits } = await db.from("rma_units").select("rma_id").like("imei", `%${q}%`).limit(200);
      query = query.in("id", [...new Set((hits ?? []).map((h) => h.rma_id))].concat("00000000-0000-0000-0000-000000000000"));
    } else query = query.ilike("number", `%${q}%`);
  }

  const [{ data: rows }, { data: all }, { data: accounts }, { data: cutoffSetting }] = await Promise.all([
    query,
    db.from("rma_overview").select("status, units_to_batch, intermediary_id").neq("status", "closed").limit(2000),
    db.from("accounts").select("id, code, name").order("code"),
    db.from("settings").select("value").eq("key", "batch_cutoff").maybeSingle(),
  ]);
  const open = all ?? [];
  const count = (s: RmaStatus) => open.filter((r) => r.status === s).length;
  const toBatch = open.filter((r) => r.intermediary_id).reduce((t, r) => t + Number(r.units_to_batch ?? 0), 0);
  const cut = cutoffInfo((cutoffSetting?.value ?? undefined) as CutoffSetting | undefined);
  const left = cut.left;
  const urgent = toBatch > 0 && cut.msLeft < 3 * 86400_000;

  return (
    <>
      <RealtimeRefresh tables={["rmas", "rma_units"]} />
      <PageHeader title="RMAs" description="Claims of defective units (SOP P6): IMEI check, evidence, the Sales Director's decision, weekly EU batch and credit notes.">
        <Button asChild size="sm"><Link href="/rmas/new">New RMA</Link></Button>
      </PageHeader>
      <SectionTabs tabs={rmaTabs(user.role)} />

      <Card className={cn("mb-4", urgent ? "border-hkr-action/50 bg-hkr-red-tint/40" : "")} data-testid="cutoff-banner">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
          <span className="font-medium">EU batch cut-off: Friday {formatDate(cut.date)}, 12:00 Amsterdam</span>
          <span className={cn(urgent ? "font-semibold text-hkr-action" : "text-muted-foreground")}>{left} left</span>
          <span className={cn(toBatch ? "text-hkr-action" : "text-muted-foreground")} data-testid="units-to-batch">
            {toBatch ? `${toBatch} approved unit${toBatch === 1 ? "" : "s"} to put in a batch` : "No approved units waiting for a batch"}
          </span>
          {user.role !== "bd" ? <Link href="/rmas/batches" className="ml-auto text-sm underline">Open EU batches</Link> : null}
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="rma-kpis">
        <StatTile label="Waiting for the client" value={count("requested")} sub="form, IMEI or evidence missing" href="/rmas?status=requested" />
        <StatTile label="To verify" value={count("form_received")} tone="attention" href="/rmas?status=form_received" />
        <StatTile label="To approve (admin)" value={count("verified")} tone="attention" href="/rmas?status=verified" />
        <StatTile label="Awaiting return / in batch" value={count("approved") + count("awaiting_return") + count("in_batch")} href="/rmas?status=awaiting_return" />
        <StatTile label="Open RMAs" value={open.length} href="/rmas" />
      </div>

      <RmaFilters accounts={accounts ?? []} />

      <Card>
        <CardContent className="px-0">
          <Table data-testid="rmas-table">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">RMA</TableHead><TableHead>Status</TableHead><TableHead>From</TableHead>
                <TableHead className="text-right">Units</TableHead><TableHead>Checks</TableHead>
                <TableHead className="text-right">Credit / cap</TableHead><TableHead>Opened</TableHead><TableHead>Next action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => {
                const over = Number(r.credit_usd) > Number(r.cap_usd) && Number(r.credit_usd) > 0;
                return (
                  <TableRow key={r.id!}>
                    <TableCell className="pl-4">
                      <Link href={`/rmas/${r.id}`} className="font-mono text-xs font-medium hover:underline">{r.number}</Link>
                      <span className="block truncate text-xs text-muted-foreground">{r.account_name}</span>
                    </TableCell>
                    <TableCell><RmaStatusBadge status={r.status as RmaStatus} /></TableCell>
                    <TableCell className="text-xs">{CHANNEL[r.channel as keyof typeof CHANNEL]}</TableCell>
                    <TableCell className="text-right" data-tabular>{r.units}</TableCell>
                    <TableCell className="max-w-56 whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {r.units_not_found ? <Flag tone="bad">{r.units_not_found} NOT FOUND</Flag> : null}
                        {r.units_without_evidence ? <Flag>{r.units_without_evidence} without evidence</Flag> : null}
                        {r.units_swollen ? <Flag tone="bad">{r.units_swollen} swollen battery</Flag> : null}
                        {r.units_out_of_warranty ? <Flag>{r.units_out_of_warranty} out of warranty</Flag> : null}
                        {r.units_claimed_before ? <Flag>{r.units_claimed_before} claimed before</Flag> : null}
                        {r.units_pending && r.status !== "requested" && r.status !== "form_received" ? <Flag tone="info">{r.units_pending} undecided</Flag> : null}
                      </div>
                    </TableCell>
                    <TableCell className={cn("text-right text-xs", over && "font-medium text-hkr-action")} data-tabular>
                      {Number(r.credit_usd) ? money(r.credit_usd) : "—"}<span className="block text-muted-foreground">cap {money(r.cap_usd)}</span>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(r.created_at)}</TableCell>
                    <TableCell className="max-w-72 text-xs whitespace-normal text-muted-foreground">{RMA_NEXT_ACTION[r.status as RmaStatus]}</TableCell>
                  </TableRow>
                );
              })}
              {!rows?.length ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No RMAs here.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
