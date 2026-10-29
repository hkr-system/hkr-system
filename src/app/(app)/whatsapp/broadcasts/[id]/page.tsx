import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { fillBody } from "@/lib/whatsapp/templates";
import { NoAccess } from "@/components/no-access";
import { BroadcastActions } from "@/components/whatsapp/broadcast-actions";
import { RealtimeRefresh } from "@/components/whatsapp/realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BROADCAST_STATUS_LABEL as STATUS_LABEL } from "@/lib/whatsapp/labels";
import { loadMessageRates } from "@/lib/whatsapp/broadcasts";
import { estimateCost } from "@/lib/whatsapp/pricing";
import { CostEstimateView } from "@/components/whatsapp/cost-estimate";

export const metadata: Metadata = { title: "Broadcast" };

export default async function BroadcastPage({ params }: PageProps<"/whatsapp/broadcasts/[id]">) {
  const access = await checkSection("whatsapp");
  if (!access.allowed || access.user.role === "account_specialist") return <NoAccess />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await createClient();
  const [{ data: b }, { data: recipients }, { data: billable }, rates] = await Promise.all([
    db.from("wa_broadcasts").select("*, wa_numbers(label, display_phone, broadcasts_paused, paused_reason, daily_broadcast_limit), wa_templates(name, language, category, components)").eq("id", id).maybeSingle(),
    db.from("wa_broadcast_recipients").select("id, phone, status, skip_reason, error_title, sent_at, leads(id, company)").eq("broadcast_id", id).order("status").limit(1000),
    // recipients Meta charges (or will charge): everything except skipped and failed
    db.from("wa_broadcast_recipients").select("phone").eq("broadcast_id", id).not("status", "in", "(skipped,failed)").limit(20000),
    loadMessageRates(db),
  ]);
  if (!b) notFound();
  const n = (Array.isArray(b.wa_numbers) ? b.wa_numbers[0] : b.wa_numbers) as { label: string | null; display_phone: string; broadcasts_paused: boolean; paused_reason: string | null; daily_broadcast_limit: number } | null;
  const t = (Array.isArray(b.wa_templates) ? b.wa_templates[0] : b.wa_templates) as { name: string; language: string; category: string; components: unknown } | null;
  const seg = (b.segment ?? {}) as { tiers?: string[]; markets?: string[]; stages?: string[] };
  const tz = access.user.timezone;
  const cost = estimateCost((billable ?? []).map((r) => r.phone), t?.category ?? "UTILITY", rates);
  const stats = [["Queued", b.count_queued], ["Sent", b.count_sent], ["Delivered", b.count_delivered], ["Read", b.count_read], ["Failed", b.count_failed], ["Skipped", b.count_skipped]] as const;

  return (
    <>
      <RealtimeRefresh tables={["wa_messages"]} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/whatsapp/broadcasts" className="text-xs text-muted-foreground hover:underline">← Broadcasts</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{b.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" data-testid="broadcast-status">{STATUS_LABEL[b.status] ?? b.status}</Badge>
            <span>From {n?.label ?? ""} {n?.display_phone}</span>
            <span>· {t?.name} ({t?.category.toLowerCase()})</span>
            <span>· {b.scheduled_at ? `Scheduled ${formatDateTime(b.scheduled_at, tz)}` : "Sends when approved"}</span>
          </p>
          {n?.broadcasts_paused ? <p className="mt-1 text-sm text-amber-700">Number paused: {n.paused_reason}</p> : null}
        </div>
        <BroadcastActions id={b.id} status={b.status} isAdmin={access.user.role === "admin"} isOwner={b.created_by === access.user.id} />
      </div>
      <div className="grid gap-6">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {stats.map(([label, v]) => (
            <Card key={label} className="py-3"><CardContent className="px-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold tabular-nums">{v}</div></CardContent></Card>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-sm">Message</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="rounded-md bg-muted p-3 whitespace-pre-wrap">{t ? fillBody(t.components, ((b.variables ?? []) as { source: string; value?: string }[]).map((v) => v.source === "text" ? v.value ?? "" : `[${v.source.replace("_", " ")}]`)) : ""}</p>
            {b.header_filename ? <p className="text-xs text-muted-foreground">Header file: {b.header_filename}</p> : null}
            <CostEstimateView cost={cost} title={["draft", "pending_approval", "approved"].includes(b.status) ? "Estimated cost" : "Estimated cost (sent + still queued)"} />
            <p className="text-xs text-muted-foreground">
              Audience: tiers {seg.tiers?.join(", ") || "all"} · markets {seg.markets?.join(", ") || "all"} · stages {seg.stages?.join(", ") || "all"} ·
              daily limit {n?.daily_broadcast_limit} per number
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Recipients</CardTitle></CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4">Lead</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead>Detail</TableHead><TableHead>Sent</TableHead></TableRow></TableHeader>
              <TableBody>
                {(recipients ?? []).map((r) => {
                  const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4">{lead ? <Link className="hover:underline" href={`/leads/${lead.id}`}>{lead.company}</Link> : "—"}</TableCell>
                      <TableCell className="text-xs">{r.phone}</TableCell>
                      <TableCell><Badge variant="outline" className={r.status === "failed" ? "text-destructive" : ""}>{r.status}</Badge></TableCell>
                      <TableCell className="max-w-xs text-xs whitespace-normal text-muted-foreground">{r.skip_reason ?? r.error_title ?? ""}</TableCell>
                      <TableCell className="text-xs">{r.sent_at ? formatDateTime(r.sent_at, tz) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {!recipients?.length ? <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Nobody matches this audience.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
