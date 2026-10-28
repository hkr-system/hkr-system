"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  addUnits, createCreditNoteFromRma, deleteUnit, saveRmaNotes, setRmaStatus, updateUnit, type ActionState, type UnitInput,
} from "@/app/(app)/rmas/actions";
import {
  FAULT_CATEGORIES, LOCATION_LABEL, RESOLUTIONS, RESOLUTION_LABEL, RMA_STATUSES, RMA_STATUS_LABEL, SOURCE_LABEL, UNIT_STATUSES,
  UNIT_STATUS_LABEL, CREDIT_RESOLUTIONS, type RmaResolution, type RmaStatus, type RmaUnitStatus,
} from "@/lib/rmas/constants";
import { money } from "@/lib/orders/constants";
import { luhnValid } from "@/lib/orders/imei";
import { cn } from "@/lib/utils";
import { FileUpload } from "@/components/orders/file-upload";
import { NativeSelect } from "@/components/native-select";
import { Flag, ImeiCheckBadge } from "@/components/rmas/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ---------------------------------------------------------------------------------------
// Status: one clear next step; admin approves; admin can set any status (corrections).
// ---------------------------------------------------------------------------------------
const NEXT: Partial<Record<RmaStatus, { to: RmaStatus; label: string; admin?: boolean }[]>> = {
  requested: [{ to: "form_received", label: "Mark form received" }],
  form_received: [{ to: "verified", label: "Mark verified (IMEI check and evidence done)" }],
  verified: [{ to: "approved", label: "Approve (Sales Director)", admin: true }],
  approved: [{ to: "awaiting_return", label: "Waiting for the units" }, { to: "credit_agreed", label: "Credit agreed" }],
  awaiting_return: [{ to: "received_hk", label: "Mark received in HK" }],
  credit_agreed: [{ to: "closed", label: "Close the RMA" }],
  in_batch: [{ to: "received_hk", label: "Mark received in HK" }],
  received_hk: [{ to: "closed", label: "Close the RMA" }],
};

export function RmaStatusControls({ rmaId, status, isAdmin }: { rmaId: string; status: RmaStatus; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (s: RmaStatus) => start(async () => {
    setError(null);
    const r = await setRmaStatus(rmaId, s);
    if (r.error) setError(r.error);
    router.refresh();
  });
  return (
    <div className="grid gap-2" data-testid="rma-status-controls">
      <div className="flex flex-wrap items-center gap-2">
        {(NEXT[status] ?? []).map((n) => (n.admin && !isAdmin ? (
          <span key={n.to} className="text-xs text-muted-foreground">Waiting for an admin to approve.</span>
        ) : (
          <Button key={n.to} size="sm" disabled={pending} onClick={() => run(n.to)} data-testid={`rma-to-${n.to}`}>{n.label}</Button>
        )))}
        {isAdmin ? (
          <NativeSelect value="" onChange={(e) => e.target.value && run(e.target.value as RmaStatus)} className="w-auto" aria-label="Set status (admin)" disabled={pending}>
            <option value="">Set status (admin)…</option>
            {RMA_STATUSES.filter((s) => s !== status).map((s) => <option key={s} value={s}>{RMA_STATUS_LABEL.en[s]}</option>)}
          </NativeSelect>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive" role="alert" data-testid="rma-status-error">{error}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Units: the decision per IMEI (resolution, credit, unit status) and its evidence.
// ---------------------------------------------------------------------------------------
export type UnitRow = {
  id: string; imei: string; imei_check: "ours" | "not_found"; check_note: string | null; model: string | null; storage_gb: number | null;
  color: string | null; fault_category: string; fault_text: string | null; source: "testing" | "end_customer"; detected_on: string | null;
  battery_swollen: boolean; physical_damage: boolean; warranty_ok: boolean | null; claimed_before: string | null; shipped_on: string | null;
  origin_order: { id: string; number: string } | null; resolution: RmaResolution; unit_status: RmaUnitStatus;
  unit_price_usd: number | null; credit_pct: number | null; credit_fixed_usd: number | null; credit_usd: number;
  batch: string | null; hkr_notes: string | null;
  evidence: { id: string; name: string; thumb: string | null }[];
};

export function UnitsTable({ rma, accountId, accountCode, units, locked, canDelete }: {
  rma: { id: string; number: string }; accountId: string; accountCode: string; units: UnitRow[]; locked: boolean; canDelete: boolean;
}) {
  return (
    <div className="grid gap-3" data-testid="units">
      {units.map((u, i) => <UnitCard key={u.id} n={i + 1} u={u} rma={rma} accountId={accountId} accountCode={accountCode} locked={locked} canDelete={canDelete} />)}
      {!units.length ? <p className="text-sm text-muted-foreground">No units yet.</p> : null}
    </div>
  );
}

function UnitCard({ n, u, rma, accountId, accountCode, locked, canDelete }: {
  n: number; u: UnitRow; rma: { id: string; number: string }; accountId: string; accountCode: string; locked: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [credit, setCredit] = useState({ pct: u.credit_pct?.toString() ?? "", fixed: u.credit_fixed_usd?.toString() ?? "", price: u.unit_price_usd?.toString() ?? "" });
  const save = (patch: Parameters<typeof updateUnit>[1]) => start(async () => {
    setError(null);
    const r = await updateUnit(u.id, patch);
    if (r.error) setError(r.error);
    router.refresh();
  });
  const isCredit = CREDIT_RESOLUTIONS.includes(u.resolution);
  const preview = Number(credit.fixed) > 0 ? Number(credit.fixed) : (Number(credit.price) || 0) * (Number(credit.pct) || 0) / 100;
  const ours = u.imei_check === "ours";

  return (
    <div className="grid gap-3 rounded-lg border p-3 text-sm" data-testid="unit-row" data-imei={u.imei}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">#{n}</span>
        <span className="font-mono font-medium">{u.imei}</span>
        <ImeiCheckBadge ours={ours} note={u.check_note} />
        {u.check_note ? <span className="text-xs text-hkr-action">{u.check_note}</span> : null}
        {!luhnValid(u.imei) ? <Flag tone="bad">check digit fails</Flag> : null}
        {u.battery_swollen ? <Flag tone="bad">Swollen battery — cannot fly</Flag> : null}
        {u.physical_damage ? <Flag tone="bad">Physical / liquid damage</Flag> : null}
        {u.warranty_ok === false ? <Flag>Outside 12-month warranty</Flag> : null}
        {u.claimed_before ? <Flag>Claimed before in {u.claimed_before}</Flag> : null}
        {u.batch ? <Flag tone="info">Batch {u.batch}</Flag> : null}
        {canDelete && !locked ? (
          <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Remove unit" disabled={pending}
            onClick={() => { if (confirm(`Remove IMEI ${u.imei} from this RMA?`)) start(async () => { const r = await deleteUnit(u.id); if (r.error) setError(r.error); router.refresh(); }); }}>
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div><span className="text-muted-foreground">Unit: </span>{[u.model, u.storage_gb ? `${u.storage_gb}GB` : null, u.color].filter(Boolean).join(" · ") || "—"}</div>
        <div><span className="text-muted-foreground">Origin: </span>{u.origin_order ? <a href={`/orders/${u.origin_order.id}`} className="underline">{u.origin_order.number}</a> : "—"}{u.shipped_on ? ` · shipped ${u.shipped_on}` : ""}</div>
        <div><span className="text-muted-foreground">Source: </span>{SOURCE_LABEL.en[u.source]}{u.detected_on ? ` · detected ${u.detected_on}` : ""}</div>
        <div className="sm:col-span-3"><span className="text-muted-foreground">Fault: </span><span className="font-medium">{u.fault_category}</span>{u.fault_text ? ` — ${u.fault_text}` : ""}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Evidence:</span>
        {u.evidence.map((f) => (
          <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline" title={f.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.thumb ? <img src={f.thumb} alt="" className="size-10 rounded object-cover" /> : null}
            {f.thumb ? null : f.name}
          </a>
        ))}
        {!u.evidence.length ? <Flag>none yet</Flag> : null}
        <FileUpload accountId={accountId} accountCode={accountCode} rma={{ id: rma.id, number: rma.number, unitId: u.id, imei: u.imei }}
          kinds={["PRUEBAS"]} label="Add evidence" />
      </div>

      <div className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1.2fr_1fr_2fr]">
        <div className="grid gap-1">
          <Label className="text-xs">Resolution (SD decides)</Label>
          <NativeSelect value={u.resolution} disabled={pending || locked} data-testid="unit-resolution"
            onChange={(e) => save({ resolution: e.target.value as RmaResolution })}>
            {RESOLUTIONS.filter((r) => ours || r === "pending" || r === "not_covered").map((r) => <option key={r} value={r}>{RESOLUTION_LABEL.en[r]}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Unit status</Label>
          <NativeSelect value={u.unit_status} disabled={pending} onChange={(e) => save({ unit_status: e.target.value as RmaUnitStatus })}>
            {UNIT_STATUSES.map((s) => <option key={s} value={s}>{UNIT_STATUS_LABEL.en[s]}</option>)}
          </NativeSelect>
        </div>
        {isCredit ? (
          <form className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2" data-testid="unit-credit"
            onSubmit={(e) => { e.preventDefault(); save({ unit_price_usd: credit.price ? Number(credit.price) : null, credit_pct: credit.pct ? Number(credit.pct) : null, credit_fixed_usd: credit.fixed ? Number(credit.fixed) : null }); }}>
            <div className="grid gap-1"><Label className="text-xs">Unit price US$</Label><Input value={credit.price} disabled={locked} inputMode="decimal" onChange={(e) => setCredit({ ...credit, price: e.target.value })} /></div>
            <div className="grid gap-1"><Label className="text-xs">Credit %</Label><Input value={credit.pct} disabled={locked} inputMode="decimal" onChange={(e) => setCredit({ ...credit, pct: e.target.value })} /></div>
            <div className="grid gap-1"><Label className="text-xs">or fixed US$</Label><Input name="fixed" value={credit.fixed} disabled={locked} inputMode="decimal" onChange={(e) => setCredit({ ...credit, fixed: e.target.value })} /></div>
            <Button type="submit" size="sm" variant="outline" disabled={pending || locked}>Save</Button>
            <span className="col-span-4 text-xs text-muted-foreground" data-tabular>Credit: <span className="font-medium text-foreground">{money(u.credit_usd)}</span>{Math.abs(preview - Number(u.credit_usd)) > 0.004 ? ` (after saving ${money(preview)})` : ""} · a fixed amount overrides the %</span>
          </form>
        ) : (
          <div className="self-end text-xs text-muted-foreground">{u.resolution === "return_hk" ? "Returns to Hong Kong (EU: Friday batch of the intermediary)." : u.resolution === "replacement" ? "Replaced with the next order." : u.resolution === "not_covered" ? "Not covered: NOT FOUND, damage or outside 12 months." : "Choose the route proposed to the Sales Director."}</div>
        )}
      </div>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Adding units: one with its details, or many IMEIs at once with a common fault.
// ---------------------------------------------------------------------------------------
export function AddUnitsForm({ rmaId }: { rmaId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [many, setMany] = useState("");
  const [cat, setCat] = useState<string>(FAULT_CATEGORIES[0]);
  const [desc, setDesc] = useState("");
  const [source, setSource] = useState<"testing" | "end_customer">("testing");
  const [swollen, setSwollen] = useState(false);
  const submit = () => start(async () => {
    const imeis = many.match(/\d{14,17}/g) ?? [];
    const units: UnitInput[] = imeis.map((imei) => ({ imei, fault_category: cat, fault_text: desc || null, source, battery_swollen: swollen }));
    const r = await addUnits(rmaId, units);
    setMsg(r.error ? { error: r.error } : { ok: r.message });
    if (!r.error) { setMany(""); setDesc(""); setSwollen(false); }
    router.refresh();
  });
  return (
    <div className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2" data-testid="add-units">
      <div className="grid gap-1 sm:col-span-2"><Label className="text-xs">IMEI(s) — one or many, any separator</Label>
        <Textarea rows={2} value={many} onChange={(e) => setMany(e.target.value)} placeholder="356663518735225" className="font-mono" />
      </div>
      <div className="grid gap-1"><Label className="text-xs">Fault category</Label>
        <NativeSelect value={cat} onChange={(e) => setCat(e.target.value)}>{FAULT_CATEGORIES.map((f) => <option key={f}>{f}</option>)}</NativeSelect>
      </div>
      <div className="grid gap-1"><Label className="text-xs">Source</Label>
        <NativeSelect value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
          {Object.entries(SOURCE_LABEL.en).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1 sm:col-span-2"><Label className="text-xs">Fault description (what happens, when)</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={swollen} onChange={(e) => setSwollen(e.target.checked)} /> Battery swollen</label>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending || !many.trim()} onClick={submit}>Add units</Button>
        {msg.error ? <span className="text-xs text-destructive" role="alert">{msg.error}</span> : null}
        {msg.ok ? <span className="text-xs text-emerald-700">{msg.ok}</span> : null}
      </div>
    </div>
  );
}

export function RmaNotesForm({ id, notes, location, orderRefs }: { id: string; notes: string | null; location: string | null; orderRefs: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveRmaNotes, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1"><Label className="text-xs">Where are the units now?</Label>
        <NativeSelect name="units_location" defaultValue={location ?? ""}>
          <option value="">—</option>
          {Object.entries(LOCATION_LABEL.en).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1"><Label className="text-xs">Order / invoice numbers (as the client wrote them)</Label><Input name="order_refs" defaultValue={orderRefs ?? ""} /></div>
      <div className="grid gap-1"><Label className="text-xs">Internal notes (never shown to the client)</Label><Textarea name="internal_notes" rows={3} defaultValue={notes ?? ""} /></div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
        {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
        {state.message ? <span className="text-xs text-emerald-700">{state.message}</span> : null}
      </div>
    </form>
  );
}

export function PrepareCreditNote({ rmaId, disabled }: { rmaId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <Button size="sm" variant="outline" disabled={pending || disabled} data-testid="prepare-cn"
        onClick={() => start(async () => {
          const r = await createCreditNoteFromRma(rmaId);
          if (r.error) setError(r.error); else router.push(`/rmas/credit-notes/${r.id}`);
        })}>Prepare credit note</Button>
      {error ? <span className={cn("text-xs text-destructive")} role="alert">{error}</span> : null}
    </div>
  );
}
