"use client";

import { useId, useRef, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { BATTERY_OPTIONS, batteryAllowed, batteryLineEligible, colorLabel, colorsFor, splitProblem, type BatteryOption } from "@/lib/orders/colors";
import { readOrder } from "@/lib/orders/magic";
import { money } from "@/lib/orders/constants";
import { brandOf, optionsApply, sameModel } from "@/lib/brands";
import { suggest } from "@/lib/orders/model-search";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Order lines by model + GB with colours (Mixed or a split that adds up) and options (Gabriel, Nov 2 2026).

export type ModelChoice = { key: string; model: string; storage_gb: number; note: string | null; rowId?: string; price?: number; floor?: number | null };
export type Line = {
  key: string; model: string; storage_gb: number | null; description: string;
  qty: string; unit_price: string;
  mixed: boolean; colors: Record<string, string>;
  ce: boolean; imei: boolean; battery: BatteryOption | "";
  battery_unit: string; base_price: string;
  list_row_id: string; list_price: number | null;
  sku_id?: string;
};

export const emptyLine = (ce = false): Line => ({
  key: "", model: "", storage_gb: null, description: "", qty: "", unit_price: "", mixed: true, colors: {},
  ce, imei: false, battery: "new", battery_unit: "", base_price: "", list_row_id: "", list_price: null,
});

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;
export const lineSplit = (l: Line) => Object.entries(l.colors).map(([color, q]) => ({ color, qty: Math.round(num(q)) })).filter((c) => c.qty > 0);
export const lineProblem = (l: Line) => (l.model ? splitProblem(Math.round(num(l.qty)), l.mixed, lineSplit(l)) : null);

/** Apply a model choice to a line: the list price is filled unless a different price was typed by hand. */
export function withChoice(l: Line, c: ModelChoice | undefined): Line {
  if (!c) return { ...l, key: "", model: "", storage_gb: null, list_row_id: "", list_price: null };
  const typedByHand = l.unit_price !== "" && Number(l.unit_price) !== l.list_price;
  const keep = new Set(colorsFor(c.model).map((x) => x.name));
  const colors = Object.fromEntries(Object.entries(l.colors).filter(([k]) => keep.has(k)));
  const opts = optionsApply(c.model);   // Samsung: no battery option, no CE marks (Gabriel, Nov 4 2026)
  const battery = !opts ? "" : l.battery && !batteryAllowed(l.battery as BatteryOption, c.model) ? "boosted100" : l.battery;
  return {
    ...l, key: c.key, model: c.model, storage_gb: c.storage_gb, colors, battery, ce: opts ? l.ce : false,
    list_row_id: c.rowId ?? "", list_price: c.price ?? null,
    unit_price: c.price !== undefined && !typedByHand ? String(c.price) : l.unit_price,
  };
}

// Samsung model codes print as in Samsung's file ("S24 Ultra 256GB S928U"), iPhone notes in brackets
const choiceLabel = (c: ModelChoice) =>
  `${c.model} ${c.storage_gb}GB${!c.note ? "" : brandOf(c.model) === "samsung" ? ` ${c.note}` : ` (${c.note})`}`;

/** Type to search the client's models ("14 pro 256", "ip15pm"), Google-style; anything else stays as free text. */
function ModelSearch({ line, choices, onPick, onText }: {
  line: Line; choices: ModelChoice[]; onPick: (c: ModelChoice) => void; onText: (text: string) => void;
}) {
  const current = choices.find((c) => c.key === line.key);
  const shown = current ? choiceLabel(current) : line.model ? `${line.model} ${line.storage_gb ?? ""}GB` : line.description;
  const [text, setText] = useState<string | null>(null);   // null = not editing: show the chosen value
  const [active, setActive] = useState(0);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = text !== null;
  const hits = open ? suggest(choices, text) : [];
  const pick = (c: ModelChoice) => { onPick(c); setText(null); };
  const leave = () => {
    if (text !== null && text.trim() && !(current && text === shown)) onText(text.trim());
    setText(null);
  };
  return (
    <div className="relative">
      <Input
        value={open ? text : shown}
        onChange={(e) => { setText(e.target.value); setActive(0); }}
        onFocus={(e) => { setText(shown); setActive(0); e.currentTarget.select(); }}
        onBlur={() => { blurTimer.current = setTimeout(leave, 120); }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (hits[active]) pick(hits[active]); else leave(); (e.target as HTMLInputElement).blur(); }
          else if (e.key === "Escape") { setText(null); (e.target as HTMLInputElement).blur(); }
        }}
        placeholder="Type a model: 14 pro 256, ip15pm, s24u…" aria-label="Model" role="combobox" aria-expanded={open && hits.length > 0}
        aria-controls={listId} autoComplete="off" data-testid="line-model"
      />
      {open && hits.length ? (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover py-1 text-sm shadow-md">
          {hits.map((c, n) => (
            <li key={c.key} role="option" aria-selected={n === active}
              onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); pick(c); }}
              onMouseEnter={() => setActive(n)}
              className={`flex cursor-pointer justify-between gap-3 px-3 py-1.5 ${n === active ? "bg-hkr-accent-tint" : ""}`}>
              <span>{choiceLabel(c)}</span>
              {c.price !== undefined ? <span className="text-muted-foreground" data-tabular>{money(c.price)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open && text?.trim() && !hits.length ? (
        <p className="mt-1 text-xs text-muted-foreground">Not in this client&apos;s list — it will be kept as free text.</p>
      ) : null}
    </div>
  );
}

function PriceHint({ line, floor }: { line: Line; floor: number | null | undefined }) {
  if (!line.list_row_id || line.list_price === null) return null;
  const unit = Number(line.unit_price);
  if (line.unit_price !== "" && unit !== line.list_price) {
    const below = floor !== null && floor !== undefined && unit < floor;
    return (
      <span className={`text-[11px] ${below ? "text-destructive" : "text-amber-700"}`} data-testid="price-hint">
        Manual · list {money(line.list_price)}{below ? ` · below the floor ${money(floor!)}: the Sales Director decides` : ""}
      </span>
    );
  }
  return <span className="text-[11px] text-emerald-700" data-testid="price-hint">From the price list</span>;
}

export function LineEditor({ line, i, choices, isAdmin, separate, onChange, onRemove }: {
  line: Line; i: number; choices: ModelChoice[]; isAdmin: boolean; separate: boolean;
  onChange: (patch: Partial<Line> | ((l: Line) => Line)) => void; onRemove: () => void;
}) {
  const choice = choices.find((c) => c.key === line.key);
  const official = colorsFor(line.model);
  const problem = lineProblem(line);
  const split = lineSplit(line).reduce((s, c) => s + c.qty, 0);
  const qty = Math.round(num(line.qty));
  const eligible = batteryLineEligible(line.model);
  const opts = optionsApply(line.model);
  return (
    <div className="grid gap-3 rounded-lg border p-3" data-testid="order-line">
      <div className="grid gap-2 sm:grid-cols-[2fr_80px_130px_110px_32px] sm:items-start">
        <div className="grid gap-1">
          <ModelSearch line={line} choices={choices}
            onPick={(c) => onChange((l) => withChoice({ ...l, description: "" }, c))}
            onText={(text) => onChange((l) => ({ ...withChoice(l, undefined), description: text }))} />
        </div>
        <Input value={line.qty} onChange={(e) => onChange({ qty: e.target.value })} inputMode="numeric" placeholder="Qty" aria-label="Quantity" />
        <div className="grid gap-0.5">
          <Input value={line.unit_price} onChange={(e) => onChange({ unit_price: e.target.value })} inputMode="decimal" placeholder="Unit US$" aria-label="Unit price" />
          <PriceHint line={line} floor={choice?.floor} />
        </div>
        <span className="pt-2 text-right text-sm" data-tabular>{money(num(line.qty) * num(line.unit_price))}</span>
        <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label={`Remove line ${i + 1}`}><Trash2 className="size-4" /></Button>
      </div>

      {line.model ? (
        <div className="grid gap-2" data-testid="line-colors">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">Colours</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={line.mixed} onChange={(e) => onChange({ mixed: e.target.checked })} className="size-4" /> Mixed</label>
            {!line.mixed ? <span className={problem ? "text-destructive" : "text-emerald-700"} data-testid="color-check">{split} of {qty || 0} assigned{problem ? ` — ${problem}` : " ✓"}</span> : null}
          </div>
          {!line.mixed ? (
            official.length ? (
              <div className="flex flex-wrap gap-2">
                {official.map((c) => (
                  <label key={c.name} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                    <span>{colorLabel(c)}</span>
                    <Input value={line.colors[c.name] ?? ""} onChange={(e) => onChange((l) => ({ ...l, colors: { ...l.colors, [c.name]: e.target.value } }))}
                      inputMode="numeric" className="h-7 w-16" aria-label={`Quantity ${c.name}`} />
                  </label>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No official colour list for this model yet: use Mixed or write the colours in the notes.</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {opts ? <label className="flex items-center gap-1.5"><input type="checkbox" checked={line.ce} onChange={(e) => onChange({ ce: e.target.checked })} className="size-4" /> CE Marks</label> : null}
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={line.imei} onChange={(e) => onChange({ imei: e.target.checked })} className="size-4" /> IMEI matching color</label>
        {opts ? (
          <label className="flex items-center gap-1.5">Battery
            <NativeSelect value={line.battery} onChange={(e) => onChange({ battery: e.target.value as BatteryOption | "" })} className="w-auto" aria-label="Battery">
              <option value="">—</option>
              {BATTERY_OPTIONS.map((b) => <option key={b.value} value={b.value} disabled={!batteryAllowed(b.value, line.model || null) && Boolean(line.model)}>{b.label}</option>)}
            </NativeSelect>
          </label>
        ) : <span className="text-xs text-muted-foreground" data-testid="samsung-no-options">Samsung: no battery option or CE marks</span>}
        {line.battery === "new" && separate && eligible ? (
          <label className="flex items-center gap-1.5">New battery US$/unit
            <Input value={line.battery_unit} onChange={(e) => onChange({ battery_unit: e.target.value })} inputMode="decimal" className="h-8 w-20" aria-label="Battery US$ per unit" />
          </label>
        ) : null}
        {line.battery === "new" && !eligible ? <span className="text-xs text-muted-foreground">iPhone 16: no battery line on the invoice</span> : null}
        {isAdmin ? (
          <label className="flex items-center gap-1.5 text-muted-foreground">Base US$ (admin)
            <Input value={line.base_price} onChange={(e) => onChange({ base_price: e.target.value })} inputMode="decimal" placeholder="from the list" className="h-8 w-24" aria-label="Base price" />
          </label>
        ) : null}
      </div>
    </div>
  );
}

/** "Magic invoice creator": paste the client's order as it comes → lines to review. */
export function MagicReader({ choices, ceDefault, onLines, disabled }: {
  choices: ModelChoice[]; ceDefault: boolean; onLines: (lines: Line[]) => void; disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [report, setReport] = useState<{ ok: number; problems: string[]; skipped: string[] } | null>(null);
  const read = () => {
    const r = readOrder(text);
    const problems: string[] = [];
    const lines = r.lines.map((m, n) => {
      // iPhone by name, Samsung by its model key ("S24 Ultra" = "Galaxy S24 Ultra" = "s24u")
      const c = m.storage_gb ? choices.find((x) => x.storage_gb === m.storage_gb && sameModel(x.model, m.model)) : undefined;
      if (!c) problems.push(`Line ${n + 1} (${m.model} ${m.storage_gb ?? "?"}GB): not in this client's price list — check the model or type the price.`);
      for (const p of m.problems) problems.push(`Line ${n + 1} (${m.model}): ${p}`);
      const base: Line = {
        ...emptyLine(ceDefault || m.ce), model: m.model, storage_gb: m.storage_gb, qty: m.qty ? String(m.qty) : "",
        mixed: m.mixed, colors: Object.fromEntries(m.colors.map((x) => [x.color, String(x.qty)])),
        imei: m.imeiMatching, battery: m.battery ?? "new",
      };
      return c ? withChoice(base, c) : base;
    });
    setReport({ ok: lines.length, problems, skipped: r.skipped });
    if (lines.length) onLines(lines);
  };
  return (
    <div className="grid gap-2 rounded-lg border border-dashed p-3" data-testid="magic-reader">
      <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-hkr-accent" aria-hidden /> Magic invoice creator</div>
      <p className="text-xs text-muted-foreground">Paste the client&apos;s order as it came (WhatsApp, email, English or Spanish). The lines below are filled in for you to check; nothing is saved until you press Create order.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={"50 pcs iPhone 14 128 mixed\n30 iPhone 13 Pro 256: 20 negros, 10 sierra blue\n20 Galaxy S24 Ultra 256 mixed\nAll with CE and new batteries"} aria-label="Client order text" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={read} disabled={disabled || !text.trim()} data-testid="magic-read">{disabled ? "Choose the account first" : "Read the order"}</Button>
        {report ? <span className="text-sm text-emerald-700" data-testid="magic-count">{report.ok} line(s) read — check them below.</span> : null}
      </div>
      {report && (report.problems.length || report.skipped.length) ? (
        <ul className="list-disc pl-5 text-xs text-amber-800" data-testid="magic-problems">
          {report.problems.map((p) => <li key={p}>{p}</li>)}
          {report.skipped.length ? <li className="text-muted-foreground">Ignored (no model found): {report.skipped.join(" · ")}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** What the server action receives per line. */
export function lineToPayload(l: Line) {
  return {
    sku_id: l.sku_id || null, model: l.model || null, storage_gb: l.storage_gb, description: l.description,
    qty: l.qty, unit_price: l.unit_price, colors_mixed: l.mixed, colors: lineSplit(l),
    ce_marked: optionsApply(l.model) && l.ce, imei_matching_color: l.imei, battery_option: optionsApply(l.model) ? l.battery || null : null,
    battery_unit: l.battery_unit, base_price: l.base_price, list_row_id: l.list_row_id,
  };
}

export function AddLineButton({ onAdd }: { onAdd: () => void }) {
  return <div><Button type="button" size="sm" variant="outline" onClick={onAdd}><Plus className="size-3.5" /> Add line</Button></div>;
}
