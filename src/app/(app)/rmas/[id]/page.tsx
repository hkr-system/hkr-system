import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/files";
import { formatDate, formatDateTime } from "@/lib/format";
import { loadTeam } from "@/lib/leads/service";
import { money } from "@/lib/orders/constants";
import {
  CN_STATUS_LABEL, LOCATION_LABEL, RMA_NEXT_ACTION, RMA_STATUSES, RMA_STATUS_LABEL, type RmaStatus, type UnitsLocation,
} from "@/lib/rmas/constants";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";
import { FileUpload } from "@/components/orders/file-upload";
import { CnStatusBadge, RmaStatusBadge } from "@/components/rmas/badges";
import { AddUnitsForm, PrepareCreditNote, RmaNotesForm, RmaStatusControls, UnitsTable, type UnitRow } from "@/components/rmas/rma-panels";
import { RealtimeRefresh } from "@/components/whatsapp/realtime-refresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "RMA" };

const CHANNEL = { portal: "client portal", internal: "typed by the team", import: "imported xlsx form" } as const;

export default async function RmaPage({ params }: PageProps<"/rmas/[id]">) {
  const access = await checkSection("rmas");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const isAdmin = user.role === "admin";
  const { id } = await params;
  const db = await createClient();

  const { data: r } = await db.from("rmas").select("*, accounts(id, code, name, intermediaries(name))").eq("id", id).maybeSingle();
  if (!r) notFound();
  const acc = r.accounts as unknown as { id: string; code: string; name: string; intermediaries: { name: string } | null };

  const [{ data: ov }, { data: units }, { data: files }, { data: cns }, team] = await Promise.all([
    db.from("rma_overview").select("*").eq("id", id).single(),
    db.from("rma_units").select("*, orders(id, number), rma_batches(cutoff_date)").eq("rma_id", id).order("sort_order"),
    db.from("files").select("id, kind, file_name, mime_type, storage_path, rma_unit_id, created_at").eq("owner_table", "rmas").eq("owner_id", id).order("created_at"),
    db.from("credit_notes").select("id, number, status, amount, currency").eq("rma_id", id).order("created_at"),
    loadTeam(db),
  ]);
  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));

  // thumbnails for photo evidence (10-minute signed links; RLS decides)
  const images = (files ?? []).filter((f) => f.rma_unit_id && f.mime_type?.startsWith("image/"));
  const thumbs = new Map<string, string>();
  if (images.length) {
    const { data: signed } = await db.storage.from(FILES_BUCKET).createSignedUrls(images.map((f) => f.storage_path), 600);
    (signed ?? []).forEach((s, i) => { if (s.signedUrl) thumbs.set(images[i].id, s.signedUrl); });
  }

  const status = r.status as RmaStatus;
  const step = RMA_STATUSES.indexOf(status);
  const approved = step >= RMA_STATUSES.indexOf("approved");
  const locked = approved && !isAdmin;
  const credit = Number(ov?.credit_usd ?? 0);
  const cap = Number(ov?.cap_usd ?? 0);
  const over = credit > cap && credit > 0;

  const rows: UnitRow[] = (units ?? []).map((u) => ({
    id: u.id, imei: u.imei, imei_check: u.imei_check, check_note: u.check_note, model: u.model, storage_gb: u.storage_gb, color: u.color,
    fault_category: u.fault_category, fault_text: u.fault_text, source: u.source, detected_on: u.detected_on,
    battery_swollen: u.battery_swollen, physical_damage: u.physical_damage, warranty_ok: u.warranty_ok, claimed_before: u.claimed_before,
    shipped_on: u.shipped_on, origin_order: u.orders as unknown as { id: string; number: string } | null,
    resolution: u.resolution, unit_status: u.unit_status, unit_price_usd: u.unit_price_usd, credit_pct: u.credit_pct,
    credit_fixed_usd: u.credit_fixed_usd, credit_usd: Number(u.credit_usd ?? 0),
    batch: (u.rma_batches as unknown as { cutoff_date: string } | null)?.cutoff_date ?? null, hkr_notes: u.hkr_notes,
    evidence: (files ?? []).filter((f) => f.rma_unit_id === u.id).map((f) => ({ id: f.id, name: f.file_name, thumb: thumbs.get(f.id) ?? null })),
  }));
  const docs = (files ?? []).filter((f) => !f.rma_unit_id);

  return (
    <>
      <RealtimeRefresh tables={["rmas", "rma_units"]} />
      <div className="mb-4">
        <Link href="/rmas" className="text-sm text-muted-foreground hover:underline">← RMAs</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="page-title"><span className="font-mono">{r.number}</span></h1>
          <RmaStatusBadge status={status} />
          <Link href={`/accounts/${acc.id}?tab=rmas`} className="text-sm text-muted-foreground hover:underline">{acc.code} · {acc.name}</Link>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          From the {CHANNEL[r.channel]} · opened {formatDateTime(r.created_at, user.timezone)}
          {r.submitted_at ? ` · complete ${formatDateTime(r.submitted_at, user.timezone)}` : ""}
          {r.approved_at ? ` · approved ${formatDateTime(r.approved_at, user.timezone)} by ${names.get(r.approved_by ?? "") ?? "admin"}` : ""}
          {acc.intermediaries ? ` · EU intermediary ${acc.intermediaries.name}` : ""}
        </p>
      </div>

      <ol className="mb-4 flex flex-wrap gap-1 text-xs" aria-label="RMA lifecycle">
        {RMA_STATUSES.map((s, i) => (
          <li key={s} className={cn("rounded px-2 py-1", i < step ? "bg-emerald-50 text-emerald-700" : i === step ? "bg-hkr-ink font-medium text-white" : "bg-muted text-muted-foreground")}>
            {RMA_STATUS_LABEL.en[s]}
          </li>
        ))}
      </ol>

      <Card className="mb-4 border-hkr-accent/40" data-testid="next-action">
        <CardContent className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs text-muted-foreground uppercase">Next action</p>
            <p className="text-sm font-medium">{RMA_NEXT_ACTION[status]}</p>
          </div>
          <RmaStatusControls rmaId={id} status={status} isAdmin={isAdmin} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Units ({ov?.units ?? 0})</CardTitle>
              <CardDescription>
                {ov?.units_ours ?? 0} OURS · {ov?.units_not_found ?? 0} NOT FOUND · {ov?.units_without_evidence ?? 0} without evidence.
                Only OURS units can be covered; NOT FOUND = never shipped to this client (SOP P6).
                {locked ? " Approved: only an admin changes the resolution or the credit." : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <UnitsTable rma={{ id, number: r.number }} accountId={acc.id} accountCode={acc.code} units={rows} locked={locked} canDelete={!approved || isAdmin} />
              {!approved ? <AddUnitsForm rmaId={id} /> : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card className={cn(over && "border-hkr-action/50")} data-testid="cap-card">
            <CardHeader><CardTitle>Credit and cap</CardTitle><CardDescription>Cap = invoice value of the origin orders × 1 % (SOP P6 / P10).</CardDescription></CardHeader>
            <CardContent className="grid gap-1 text-sm" data-tabular>
              <div className="flex justify-between"><span>Credit of the units</span><span className="font-medium">{money(credit)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Cap</span><span>{money(cap)}</span></div>
              {over ? (
                <p className="mt-1 rounded-md bg-hkr-red-tint p-2 text-xs font-medium text-hkr-action" role="alert" data-testid="over-cap">
                  Above the cap by {money(credit - cap)}. Only the Sales Director (admin) can approve it; gather the facts and escalate.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Credit notes</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {(cns ?? []).map((c) => (
                <Link key={c.id} href={`/rmas/credit-notes/${c.id}`} className="flex items-center justify-between gap-2 hover:underline">
                  <span className="font-mono text-xs">{c.number}</span><CnStatusBadge status={c.status} /><span data-tabular>{money(c.amount, c.currency)}</span>
                </Link>
              ))}
              {!cns?.length ? <p className="text-muted-foreground">None yet.</p> : null}
              {approved && credit > 0 && !(cns ?? []).some((c) => c.status !== "cancelled") ? <PrepareCreditNote rmaId={id} /> : null}
              {(cns ?? []).some((c) => c.status === "draft") ? <p className="text-xs text-muted-foreground">Draft: {CN_STATUS_LABEL.en.draft} → an admin approves it before it goes to the client.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Client request</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid gap-1">
                <div><span className="text-muted-foreground">Contact: </span>{[r.contact_name, r.contact_info].filter(Boolean).join(" · ") || "—"}</div>
                <div><span className="text-muted-foreground">Units are: </span>{r.units_location ? LOCATION_LABEL.en[r.units_location as UnitsLocation] : "—"}</div>
                {r.client_notes ? <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2">{r.client_notes}</p> : null}
              </div>
              <RmaNotesForm id={id} notes={r.internal_notes} location={r.units_location} orderRefs={r.order_refs} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>RMA documents</CardTitle>
              <FileUpload accountId={acc.id} accountCode={acc.code} rma={{ id, number: r.number }} kinds={["FORM", "VERIF", "TRK", "OTHER"]} testId="rma-file-upload" />
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {docs.map((f) => (
                <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex justify-between gap-2 hover:underline">
                  <span className="truncate">{f.file_name}</span><span className="shrink-0 text-xs text-muted-foreground">{f.kind} · {formatDate(f.created_at)}</span>
                </a>
              ))}
              {!docs.length ? <p className="text-muted-foreground">FORM (client&apos;s xlsx), VERIF (IMEI check) and TRK go here. Evidence is attached to each unit.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
