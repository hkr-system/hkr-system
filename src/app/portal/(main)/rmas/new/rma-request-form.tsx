"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET, MAX_FILE_BYTES } from "@/lib/files";
import { luhnValid } from "@/lib/orders/imei";
import { FAULT_CATEGORIES, FAULT_ES, LOCATION_LABEL } from "@/lib/rmas/constants";
import { PORTAL_TEXT, type PortalLang } from "@/lib/portal/texts";
import { addPortalEvidence, checkImei, createPortalRma, submitPortalRma } from "../../../actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Check = Awaited<ReturnType<typeof checkImei>>;
type Unit = {
  key: number; imei: string; fault: string; text: string; source: "testing" | "end_customer"; detected: string;
  swollen: boolean; damage: boolean; files: File[]; check: Check | "loading" | null;
};
const blank = (key: number): Unit => ({ key, imei: "", fault: FAULT_CATEGORIES[0], text: "", source: "testing", detected: "", swollen: false, damage: false, files: [], check: null });

function ext(name: string) {
  const e = name.includes(".") ? name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return e ? `.${e}` : "";
}

export function RmaRequestForm({ lang, accountId, contactName, contactInfo, today }: {
  lang: PortalLang; accountId: string; contactName: string; contactInfo: string; today: string;
}) {
  const t = PORTAL_TEXT[lang];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [units, setUnits] = useState<Unit[]>([blank(1)]);
  const [head, setHead] = useState({ location: "with_client", orderRefs: "", contactName, contactInfo, notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const set = (k: number, patch: Partial<Unit>) => setUnits((us) => us.map((u) => (u.key === k ? { ...u, ...patch } : u)));

  const submit = () => start(async () => {
    setError(null);
    const bad = units.find((u) => !/^\d{15}$/.test(u.imei));
    if (bad) { setError(`${t.unit}: ${bad.imei || "—"} — ${t.imeiInvalid}`); return; }
    const noFiles = units.find((u) => !u.files.length);
    if (noFiles) { setError(`${noFiles.imei}: ${t.photos}`); return; }
    const big = units.flatMap((u) => u.files).find((f) => f.size > MAX_FILE_BYTES);
    if (big) { setError(`${big.name}: max 25 MB`); return; }
    setProgress(t.sending);
    const r = await createPortalRma({
      lang, location: head.location, orderRefs: head.orderRefs, contactName: head.contactName, contactInfo: head.contactInfo, notes: head.notes,
      units: units.map((u) => ({ imei: u.imei, fault_category: u.fault, fault_text: u.text || null, source: u.source, detected_on: u.detected || null,
        battery_swollen: u.swollen, physical_damage: u.damage })),
    });
    if (r.error || !r.id || !r.number || !r.units) { setProgress(null); setError(r.error ?? "Error"); return; }
    const db = createClient();
    const folder = `${accountId}/rmas/RMA-${r.number.split("-RMA-")[1]}`;
    const total = units.reduce((s, u) => s + u.files.length, 0);
    let n = 0;
    for (const u of units) {
      const unitId = r.units.find((x) => x.imei === u.imei)?.id;
      if (!unitId) continue;
      for (const [i, f] of u.files.entries()) {
        n += 1;
        setProgress(t.uploading(n, total));
        const name = `${r.number.replace("-RMA-", "_RMA-")}_PRUEBAS_${u.imei.slice(-6)}_${i + 1}${ext(f.name)}`;
        const path = `${folder}/${name}`;
        const up = await db.storage.from(FILES_BUCKET).upload(path, f, { contentType: f.type || undefined });
        if (up.error) continue; // the RMA stays "Requested"; the client can add it again from the RMA page
        await addPortalEvidence(unitId, path, name, f.type || "application/octet-stream", f.size);
      }
    }
    await submitPortalRma(r.id);
    router.push(`/portal/rmas/${r.id}?sent=1`);
  });

  return (
    <div className="grid gap-4" data-testid="rma-request">
      <ul className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {t.rules.map((r) => <li key={r}>• {r}</li>)}
      </ul>

      <div className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label>{t.whereNow}</Label>
          <NativeSelect value={head.location} onChange={(e) => setHead({ ...head, location: e.target.value })}>
            {Object.entries(LOCATION_LABEL[lang]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>{t.orderRefs}</Label><Input value={head.orderRefs} onChange={(e) => setHead({ ...head, orderRefs: e.target.value })} placeholder="ORD-02 / 09212026" /></div>
        <div className="grid gap-1.5"><Label>{t.contactName}</Label><Input value={head.contactName} onChange={(e) => setHead({ ...head, contactName: e.target.value })} /></div>
        <div className="grid gap-1.5"><Label>{t.contactInfo}</Label><Input value={head.contactInfo} onChange={(e) => setHead({ ...head, contactInfo: e.target.value })} /></div>
      </div>

      {units.map((u, i) => (
        <UnitCard key={u.key} n={i + 1} u={u} lang={lang} today={today} onChange={(p) => set(u.key, p)}
          onRemove={units.length > 1 ? () => setUnits((us) => us.filter((x) => x.key !== u.key)) : undefined} />
      ))}
      <div><Button variant="outline" onClick={() => setUnits((us) => [...us, blank(Math.max(...us.map((x) => x.key)) + 1)])} data-testid="add-unit"><Plus className="size-4" /> {t.addUnit}</Button></div>

      <div className="grid gap-1.5"><Label>{t.notes}</Label><Textarea rows={3} value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} /></div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-hkr-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        <Button onClick={submit} disabled={pending} size="lg" data-testid="send-rma">{pending ? progress ?? t.sending : t.submit}</Button>
        {error ? <span className="text-sm text-destructive" role="alert" data-testid="rma-error">{error}</span> : null}
      </div>
    </div>
  );
}

function UnitCard({ n, u, lang, today, onChange, onRemove }: {
  n: number; u: Unit; lang: PortalLang; today: string; onChange: (p: Partial<Unit>) => void; onRemove?: () => void;
}) {
  const t = PORTAL_TEXT[lang];
  const input = useRef<HTMLInputElement>(null);
  const last = useRef("");
  // live IMEI check against OUR records for THIS account (never reveals other clients)
  useEffect(() => {
    if (u.imei.length !== 15 || u.imei === last.current) return;
    last.current = u.imei;
    let alive = true;
    onChange({ check: "loading" });
    checkImei(u.imei).then((c) => { if (alive) onChange({ check: c }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u.imei]);
  const c = u.check && u.check !== "loading" ? u.check : null;
  return (
    <div className="grid gap-3 rounded-lg border bg-white p-4" data-testid="rma-unit">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{t.unit} {n}</span>
        {onRemove ? <Button size="sm" variant="ghost" className="ml-auto" onClick={onRemove}><Trash2 className="size-3.5" /> {t.removeUnit}</Button> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>{t.imei} (15)</Label>
          <Input value={u.imei} inputMode="numeric" autoComplete="off" className="font-mono text-base" data-testid="unit-imei"
            onChange={(e) => onChange({ imei: e.target.value.replace(/\D/g, "").slice(0, 15), check: null })} />
          {u.imei.length === 15 && !luhnValid(u.imei) ? <Warn>{t.imeiCheckDigit}</Warn> : null}
          {u.check === "loading" ? <span className="text-xs text-muted-foreground">…</span> : null}
          {c && !c.found ? <Warn testId="imei-warning">{t.imeiNotFound}</Warn> : null}
          {c && c.found ? (
            <p className="flex items-start gap-1.5 text-xs text-emerald-800" data-testid="imei-ok">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              <span>{[c.model, c.storage_gb ? `${c.storage_gb}GB` : null, c.color].filter(Boolean).join(" · ")} — {t.imeiFound(c.order ?? "", c.warranty_until ?? null)}</span>
            </p>
          ) : null}
          {c && c.found && c.warranty_ok === false ? <Warn>{t.imeiOutOfWarranty}</Warn> : null}
          {c && c.claimed_before ? <Warn>{t.imeiClaimedBefore(c.claimed_before)}</Warn> : null}
        </div>
        <div className="grid gap-1.5"><Label>{t.faultCategory}</Label>
          <NativeSelect value={u.fault} onChange={(e) => onChange({ fault: e.target.value })} data-testid="unit-fault">
            {FAULT_CATEGORIES.map((f) => <option key={f} value={f}>{lang === "es" ? FAULT_ES[f] : f}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label>{t.detected}</Label><Input type="date" max={today} value={u.detected} onChange={(e) => onChange({ detected: e.target.value })} /></div>
        <div className="grid gap-1.5 sm:col-span-2"><Label>{t.faultText}</Label><Input value={u.text} placeholder={t.faultPlaceholder} onChange={(e) => onChange({ text: e.target.value })} data-testid="unit-text" /></div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm sm:col-span-2" role="radiogroup" aria-label={t.source}>
          <label className="flex items-center gap-2"><input type="radio" checked={u.source === "testing"} onChange={() => onChange({ source: "testing" })} /> {t.sourceTesting}</label>
          <label className="flex items-center gap-2"><input type="radio" checked={u.source === "end_customer"} onChange={() => onChange({ source: "end_customer" })} /> {t.sourceCustomer}</label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={u.swollen} onChange={(e) => onChange({ swollen: e.target.checked })} /> {t.swollen}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={u.damage} onChange={(e) => onChange({ damage: e.target.checked })} /> {t.damage}</label>
        {u.swollen ? <div className="sm:col-span-2"><Warn>{t.swollenWarn}</Warn></div> : null}
        {u.damage ? <div className="sm:col-span-2"><Warn>{t.damageWarn}</Warn></div> : null}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>{t.photos}</Label>
          <input ref={input} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden" data-testid="unit-files"
            onChange={(e) => onChange({ files: [...u.files, ...Array.from(e.target.files ?? [])] })} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => input.current?.click()}>{t.addFiles}</Button>
            {u.files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                {f.name}
                <button type="button" aria-label={t.removeUnit} onClick={() => onChange({ files: u.files.filter((_, j) => j !== i) })}>×</button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Warn({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-hkr-red-tint p-2 text-xs text-hkr-action" role="alert" data-testid={testId}>
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{children}</span>
    </p>
  );
}
