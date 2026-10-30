import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { BATCH_STATUS_LABEL, type BatchStatus } from "@/lib/rmas/constants";
import { cutoffInfo, type CutoffSetting } from "@/lib/rmas/cutoff";
import { rmaTabs } from "@/lib/rmas/tabs";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { Flag } from "@/components/rmas/badges";
import {
  BatchStatusButtons, EligibleUnits, LabelUpload, RemoveFromBatch, ShipmentForm, StartBatch, type EligibleUnit,
} from "@/components/rmas/batch-panels";
import { Button } from "@/components/ui/button";
import { BatchBoard } from "@/components/rmas/batch-board";
import { buildBoard, type BoardStage } from "@/lib/rmas/board";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "EU batches" };

// "now" for the board, outside render (React purity rule)
function boardNow() {
  return new Date();
}

type U = {
  id: string; unit_price_usd: number | null; imei: string; model: string | null; fault_category: string; battery_swollen: boolean; batch_id: string | null; resolution: string;
  imei_check: string; rma_id: string; rmas: { number: string; status: string; accounts: { code: string; name: string; intermediary_id: string | null } };
};

export default async function BatchesPage() {
  const access = await checkSection("rmas");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  if (user.role === "bd") return <NoAccess message="EU batches mix several clients: admin and account specialists only." />;
  const db = await createClient();
  const [{ data: inters }, { data: batches }, { data: units }, { data: cutSetting }] = await Promise.all([
    db.from("intermediaries").select("id, name").order("name"),
    db.from("rma_batches").select("*").order("cutoff_date", { ascending: false }).limit(60),
    db.from("rma_units").select("id, unit_price_usd, imei, model, fault_category, battery_swollen, batch_id, resolution, imei_check, rma_id, rmas!inner(number, status, accounts!inner(code, name, intermediary_id))")
      .eq("resolution", "return_hk").limit(3000),
    db.from("settings").select("value").eq("key", "batch_cutoff").maybeSingle(),
  ]);
  const all = (units ?? []) as unknown as U[];
  const cut = cutoffInfo((cutSetting?.value ?? undefined) as CutoffSetting | undefined);
  const left = cut.left;
  const interName = new Map((inters ?? []).map((i) => [i.id, i.name]));
  const board = buildBoard((batches ?? []).map((b) => ({
    id: b.id, intermediary: interName.get(b.intermediary_id) ?? "—", cutoff: b.cutoff_date, status: b.status as BoardStage,
    awb: b.awb, hasLabel: Boolean(b.label_path), shippedAt: b.shipped_at, receivedAt: b.received_at,
    units: all.filter((u) => u.batch_id === b.id).map((u) => ({ client: u.rmas.accounts.code, price: u.unit_price_usd === null ? null : Number(u.unit_price_usd), rmaClosed: u.rmas.status === "closed" })),
  })), boardNow());

  return (
    <>
      <PageHeader title="EU batches" description="SOP P11: every Friday 12:00 (Amsterdam) the approved units of the clients of each EU intermediary travel to Hong Kong in one consolidated shipment." />
      <SectionTabs tabs={rmaTabs(user.role)} />
      <BatchBoard columns={board} />
      <p className="mb-4 text-sm">Next cut-off: <span className="font-medium">Friday {formatDate(cut.date)}, 12:00 Amsterdam</span> · <span className="text-hkr-action">{left} left</span></p>

      <div className="grid gap-4">
        {(inters ?? []).map((it) => {
          const mine = all.filter((u) => u.rmas.accounts.intermediary_id === it.id);
          const eligible = mine.filter((u) => !u.batch_id && u.imei_check === "ours" && !u.battery_swollen && ["approved", "awaiting_return", "credit_agreed"].includes(u.rmas.status));
          const swollen = mine.filter((u) => !u.batch_id && u.battery_swollen && u.rmas.status !== "closed");
          const current = (batches ?? []).find((b) => b.intermediary_id === it.id && b.status === "open");
          const history = (batches ?? []).filter((b) => b.intermediary_id === it.id && b.id !== current?.id);
          const inBatch = current ? mine.filter((u) => u.batch_id === current.id) : [];
          const clients = [...new Set(inBatch.map((u) => u.rmas.accounts.code))];
          return (
            <Card key={it.id} data-testid={`intermediary-${it.name}`}>
              <CardHeader>
                <CardTitle>{it.name}</CardTitle>
                <CardDescription>{eligible.length} approved unit{eligible.length === 1 ? "" : "s"} waiting · {current ? `open batch for Friday ${formatDate(current.cutoff_date)} with ${inBatch.length} units` : "no open batch"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div className="grid content-start gap-2">
                  <p className="text-sm font-medium">Waiting for a batch</p>
                  <EligibleUnits batchId={current?.id ?? null} units={eligible.map<EligibleUnit>((u) => ({ id: u.id, imei: u.imei, rma: u.rmas.number, rmaId: u.rma_id, client: u.rmas.accounts.code, model: u.model, fault: u.fault_category }))} />
                  {swollen.length ? (
                    <p className="text-xs text-hkr-action">{swollen.length} unit{swollen.length === 1 ? "" : "s"} with a swollen battery cannot fly: credit or replacement with the next order ({swollen.map((u) => u.imei).join(", ")}).</p>
                  ) : null}
                  {!current ? <StartBatch intermediaryId={it.id} cutoff={cut.date} label={`Start the batch for Friday ${formatDate(cut.date)}`} /> : null}
                </div>
                {current ? (
                  <div id={`batch-${current.id}`} className={cn("grid scroll-mt-20 content-start gap-3 rounded-lg border p-3")} data-testid="open-batch">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Batch {formatDate(current.cutoff_date)}</span>
                      <Flag tone="info">{BATCH_STATUS_LABEL[current.status as BatchStatus]}</Flag>
                      <span className="text-xs text-muted-foreground">{inBatch.length} units · {clients.length} clients</span>
                      <div className="ml-auto flex gap-2">
                        <Button asChild size="xs" variant="outline"><a href={`/api/rmas/batches/${current.id}/xlsx`} data-testid="batch-xlsx">Consolidated xlsx</a></Button>
                      </div>
                    </div>
                    <ul className="grid gap-1 text-sm">
                      {inBatch.map((u) => (
                        <li key={u.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">{u.imei}</span><span className="text-xs text-muted-foreground">{u.rmas.number} · {u.model ?? "—"} · {u.fault_category}</span>
                          <span className="ml-auto"><RemoveFromBatch unitId={u.id} /></span>
                        </li>
                      ))}
                      {!inBatch.length ? <li className="text-muted-foreground">Empty: add the waiting units.</li> : null}
                    </ul>
                    {clients.length ? (
                      <p className="text-xs">Per-client copies: {clients.map((c) => <a key={c} className="mr-2 underline" href={`/api/rmas/batches/${current.id}/xlsx?client=${c}`}>{c}</a>)}</p>
                    ) : null}
                    <ShipmentForm batch={{ ...current, weight_kg: current.weight_kg === null ? null : Number(current.weight_kg) }} />
                    <div className="flex flex-wrap items-start gap-3">
                      <LabelUpload batchId={current.id} />
                      {current.label_path ? <a href={`/api/rmas/batches/${current.id}/label`} className="text-xs underline" target="_blank" rel="noreferrer">{current.label_name}</a> : <span className="text-xs text-muted-foreground">No label yet</span>}
                    </div>
                    <BatchStatusButtons batchId={current.id} status={current.status} units={inBatch.length} hasAwb={Boolean(current.awb)} />
                  </div>
                ) : null}
                {history.length ? (
                  <div className="grid gap-1 text-sm lg:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Earlier batches</p>
                    {history.map((b) => {
                      const n = all.filter((u) => u.batch_id === b.id).length;
                      return (
                        <div key={b.id} id={`batch-${b.id}`} className="flex scroll-mt-20 flex-wrap items-center gap-3 text-xs">
                          <span className="font-medium">{formatDate(b.cutoff_date)}</span><Flag tone="info">{BATCH_STATUS_LABEL[b.status as BatchStatus]}</Flag>
                          <span>{n} units · {b.carrier} {b.awb ?? ""}</span>
                          {b.shipped_at ? <span className="text-muted-foreground">shipped {formatDateTime(b.shipped_at, user.timezone)}</span> : null}
                          {b.email_sent_at ? <span className="text-emerald-700">email sent</span> : null}
                          <a className="underline" href={`/api/rmas/batches/${b.id}/xlsx`}>xlsx</a>
                          {b.status === "shipped" ? <BatchStatusButtons batchId={b.id} status={b.status} units={n} hasAwb /> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
        <p className="text-xs text-muted-foreground">Clients without an EU intermediary return their units individually (instructions from the account specialist); their RMAs show “Awaiting return”. <Link href="/settings" className="underline">Recipients of the “batch shipped” email</Link> are set in Settings.</p>
      </div>
    </>
  );
}
