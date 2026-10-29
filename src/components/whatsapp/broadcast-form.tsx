"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { MARKETS, STAGES, TIERS, type LeadStage, type LeadTier, type Market } from "@/lib/leads/constants";
import { bodyVariableCount, fillBody, headerFormat } from "@/lib/whatsapp/templates";
import { createBroadcast, previewAudience } from "@/app/(app)/whatsapp/broadcasts/actions";
import { CostEstimateView } from "@/components/whatsapp/cost-estimate";

type Tpl = { id: string; name: string; language: string; category: string; components: unknown };

function Checks<T extends string>({ name, options, value, onChange }: { name: string; options: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name={name} value={o} checked={value.includes(o)} className="size-4"
            onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
          {o}
        </label>
      ))}
    </div>
  );
}

export function BroadcastForm({ numbers, templates }: { numbers: { id: string; label: string }[]; templates: Tpl[] }) {
  const [state, action, pending] = useActionState(createBroadcast, {});
  const [tplId, setTplId] = useState(templates[0]?.id ?? "");
  const [tiers, setTiers] = useState<LeadTier[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [audience, setAudience] = useState<Awaited<ReturnType<typeof previewAudience>> | null>(null);
  const [checking, start] = useTransition();
  const tpl = templates.find((t) => t.id === tplId);
  const count = tpl ? bodyVariableCount(tpl.components) : 0;
  const fmt = tpl ? headerFormat(tpl.components) : null;
  const example = Array.from({ length: count }, (_, i) => {
    const s = sources[i] ?? (i === 0 ? "first_name" : "company");
    return s === "text" ? "…" : s === "first_name" ? "Eva" : s === "company" ? "Tulip Phones BV" : "Eva Jansen";
  });

  if (!templates.length) return <p className="text-sm text-muted-foreground">No approved templates yet: sync them in WhatsApp → Templates.</p>;
  if (!numbers.length) return <p className="text-sm text-muted-foreground">No connected WhatsApp number yet.</p>;

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label>Name</Label><Input name="name" required placeholder="e.g. Price list week 44 — EU" /></div>
        <div className="grid gap-1.5"><Label>Send from</Label>
          <NativeSelect name="wa_number_id">{numbers.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</NativeSelect>
        </div>
        <div className="grid gap-1.5 sm:col-span-2"><Label>Template</Label>
          <NativeSelect name="template_id" value={tplId} onChange={(e) => { setTplId(e.target.value); setSources([]); setAudience(null); }}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.language} · {t.category.toLowerCase()}</option>)}
          </NativeSelect>
          {tpl?.category === "MARKETING" ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">Marketing template: US (+1) numbers are skipped automatically (Meta does not deliver marketing to the US). Every recipient must have opted in.</p>
          ) : null}
        </div>
      </div>

      {count ? (
        <div className="grid gap-2">
          <Label>Variables</Label>
          {Array.from({ length: count }, (_, i) => (
            <div key={`${tplId}-${i}`} className="flex flex-wrap items-center gap-2">
              <span className="w-10 text-xs text-muted-foreground">{`{{${i + 1}}}`}</span>
              <NativeSelect name="var_source" className="w-44" defaultValue={i === 0 ? "first_name" : "company"}
                onChange={(e) => setSources((s) => { const n = [...s]; n[i] = e.target.value; return n; })}>
                <option value="first_name">Contact first name</option>
                <option value="contact_name">Contact full name</option>
                <option value="company">Company</option>
                <option value="text">Fixed text…</option>
              </NativeSelect>
              <Input name="var_value" className="w-64" placeholder="Fixed text (if chosen)" />
            </div>
          ))}
          {tpl ? <p className="rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{fillBody(tpl.components, example)}</p> : null}
        </div>
      ) : null}

      {fmt && fmt !== "TEXT" ? (
        <div className="grid gap-1.5">
          <Label>Header {fmt.toLowerCase()} (e.g. the promotion PDF)</Label>
          <Input type="file" name="header_file" required accept={fmt === "DOCUMENT" ? ".pdf,.xlsx,.xls" : fmt === "IMAGE" ? "image/*" : "video/*"} />
        </div>
      ) : null}

      <div className="grid gap-3 rounded-lg border p-3">
        <Label>Audience (opted-in, not disqualified, with a phone)</Label>
        <div className="grid gap-1"><span className="text-xs text-muted-foreground">Tier (empty = all)</span><Checks name="tiers" options={TIERS} value={tiers} onChange={(v) => { setTiers(v); setAudience(null); }} /></div>
        <div className="grid gap-1"><span className="text-xs text-muted-foreground">Market (empty = all)</span><Checks name="markets" options={MARKETS} value={markets} onChange={(v) => { setMarkets(v); setAudience(null); }} /></div>
        <div className="grid gap-1"><span className="text-xs text-muted-foreground">Stage (empty = all)</span><Checks name="stages" options={STAGES} value={stages} onChange={(v) => { setStages(v); setAudience(null); }} /></div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={checking}
            onClick={() => start(async () => setAudience(await previewAudience({ tiers, markets, stages }, tplId)))}>
            {checking ? "Counting…" : "Count recipients and cost"}
          </Button>
          {audience ? <span className="text-sm" data-testid="audience">{audience.queued} will receive it{audience.skipped ? `, ${audience.skipped} skipped (US numbers)` : ""}.</span> : null}
        </div>
        {audience ? <CostEstimateView cost={audience.cost} /> : null}
      </div>

      <div className="grid gap-1.5 sm:w-72">
        <Label>Send at (your time; empty = as soon as approved)</Label>
        <Input type="datetime-local" name="scheduled_local" />
      </div>

      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button></div>
    </form>
  );
}
