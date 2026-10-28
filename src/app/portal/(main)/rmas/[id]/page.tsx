import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPortalContext, portalDate, portalMoney } from "@/lib/portal/session";
import {
  FAULT_ES, LOCATION_LABEL, RESOLUTION_LABEL, RMA_STATUS_HELP_EN, RMA_STATUS_HELP_ES, SOURCE_LABEL, UNIT_STATUS_LABEL,
  type RmaStatus, type UnitsLocation,
} from "@/lib/rmas/constants";
import { RmaStatusBadge, Flag } from "@/components/rmas/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddEvidence, CompleteRequest } from "./add-evidence";

export const metadata: Metadata = { title: { absolute: "RMA · Client portal" } };

export default async function PortalRma({ params, searchParams }: PageProps<"/portal/rmas/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { db, account, t, lang } = await getPortalContext();
  const { data: r } = await db.from("portal_rmas").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const [{ data: units }, { data: files }] = await Promise.all([
    db.from("portal_rma_units").select("*").eq("rma_id", id).order("sort_order"),
    db.from("portal_files").select("id, rma_unit_id, file_name").eq("owner_table", "rmas").eq("owner_id", id),
  ]);
  const status = r.status as RmaStatus;
  const canAdd = ["requested", "form_received", "verified"].includes(status);
  const help = lang === "es" ? RMA_STATUS_HELP_ES : RMA_STATUS_HELP_EN;

  return (
    <div className="grid gap-4">
      <div>
        <Link href="/portal/rmas" className="text-sm text-muted-foreground hover:underline">← {t.rmas}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight"><span className="font-mono">{r.number}</span></h1>
          <RmaStatusBadge status={status} lang={lang} />
        </div>
        <p className="mt-1 text-sm">{help[status]}</p>
        {sp.sent ? <p className="mt-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="rma-sent">{status === "requested" ? t.missingEvidence : t.sent(r.number)}</p> : null}
        {status === "requested" && r.units_without_evidence === 0 ? <div className="mt-2"><CompleteRequest lang={lang} rmaId={id} /></div> : null}
      </div>
      <Card>
        <CardContent className="grid gap-1 py-4 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">{t.submitted}: </span>{portalDate(r.submitted_at ?? r.created_at, lang)}</div>
          <div><span className="text-muted-foreground">{t.whereNow} </span>{r.units_location ? LOCATION_LABEL[lang][r.units_location as UnitsLocation] : "—"}</div>
          <div><span className="text-muted-foreground">{t.orderRefs}: </span>{r.order_refs ?? "—"}</div>
          {r.credit_usd !== null && Number(r.credit_usd) > 0 ? <div><span className="text-muted-foreground">{t.credit}: </span><span className="font-medium">{portalMoney(r.credit_usd)}</span></div> : null}
          {r.client_notes ? <p className="text-muted-foreground sm:col-span-2">{r.client_notes}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t.units} ({units?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="grid gap-3" data-testid="portal-rma-units">
          {(units ?? []).map((u) => {
            const ev = (files ?? []).filter((f) => f.rma_unit_id === u.id);
            return (
              <div key={u.id} className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{u.imei}</span>
                  {!u.imei_found ? <Flag tone="bad">{lang === "es" ? "No está en nuestros registros" : "Not in our records"}</Flag> : null}
                  {u.warranty_ok === false ? <Flag>{lang === "es" ? "Fuera de garantía" : "Outside warranty"}</Flag> : null}
                  {u.battery_swollen ? <Flag tone="bad">{t.swollen}</Flag> : null}
                  <span className="ml-auto text-xs"><span className="text-muted-foreground">{t.unitStatus}: </span>{UNIT_STATUS_LABEL[lang][u.unit_status]}</span>
                </div>
                <div className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <div>{[u.model, u.storage_gb ? `${u.storage_gb}GB` : null, u.color].filter(Boolean).join(" · ") || "—"}</div>
                  <div><span className="text-muted-foreground">{t.source}: </span>{SOURCE_LABEL[lang][u.source]}{u.detected_on ? ` · ${portalDate(u.detected_on, lang)}` : ""}</div>
                  <div className="sm:col-span-2"><span className="text-muted-foreground">{t.fault}: </span>{lang === "es" ? FAULT_ES[u.fault_category as keyof typeof FAULT_ES] ?? u.fault_category : u.fault_category}{u.fault_text ? ` — ${u.fault_text}` : ""}</div>
                  {u.resolution ? <div><span className="text-muted-foreground">{t.resolution}: </span><span className="font-medium">{RESOLUTION_LABEL[lang][u.resolution]}</span>{u.credit_usd !== null && Number(u.credit_usd) > 0 ? ` · ${portalMoney(u.credit_usd)}` : ""}</div> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t.evidence}:</span>
                  {ev.map((f) => <a key={f.id} href={`/api/portal/files/${f.id}`} target="_blank" rel="noreferrer" className="underline">{f.file_name}</a>)}
                  {!ev.length ? <Flag>{lang === "es" ? "sin evidencia" : "none"}</Flag> : null}
                  {canAdd ? <AddEvidence lang={lang} accountId={account.id} rmaNumber={r.number} unitId={u.id} imei={u.imei} count={ev.length} /> : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
