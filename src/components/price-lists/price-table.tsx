"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EditLock } from "@/components/edit-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RemoveRowButton } from "@/components/price-lists/list-actions";
import { savePrices } from "@/app/(app)/price-lists/actions";
import { baseOf, marginMarkup, priceTone, GREEN_EXTRA_PCT, type Tone } from "@/lib/price-lists/adjust";
import { cn } from "@/lib/utils";

export type PriceRow = {
  id: string; label: string; gb: number; base: number | null;   // base: admin only
  engine: number | null; price: number; floor: number | null; adjusted: boolean;
  rule: { increment: number; price: number } | null;            // priced by a client rule (base + fixed US$)
  before: { price: number; adjusted: boolean } | null;          // previous version of this client's list
};

const TONE: Record<Tone, string> = {
  red: "bg-red-50 text-red-700 font-semibold",
  yellow: "bg-amber-50 text-amber-800 font-semibold",
  green: "bg-emerald-50 text-emerald-700 font-semibold",
  none: "",
};
const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)} %`);
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

// Client list with adjustable prices (Gabriel, Nov 3 2026). Draft + ✏️ Edit → every price can be typed; the colour and,
// for the admin, the margin / markup on the real cost change while typing. "Remember" saves price − base as the client's
// rule (fixed US$ per model + GB) for the next lists; rows priced by a rule are listed with the amounts to verify.
export function PriceTable({ listId, rows, rmaPct, baseMarginPct, isAdmin, editable, prevVersion }: {
  listId: string; rows: PriceRow[]; rmaPct: number; baseMarginPct: number; isAdmin: boolean; editable: boolean; prevVersion: number | null;
}) {
  const router = useRouter();
  const initial = () => Object.fromEntries(rows.map((r) => [r.id, r.price.toFixed(2)]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [remember, setRemember] = useState<Record<string, boolean>>({});
  // saved prices, a removed row or new percentages arrive as new rows → start again from them (the message stays)
  const sig = rows.map((r) => `${r.id}:${r.price}:${r.engine}:${r.rule?.increment ?? ""}`).join("|");
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) { setSeen(sig); setValues(initial()); setRemember({}); }
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const priceOf = (r: PriceRow) => { const v = Number(String(values[r.id] ?? r.price).replace(/,/g, "")); return Number.isFinite(v) ? v : r.price; };
  const autoOf = (r: PriceRow) => r.rule?.price ?? r.engine;
  // the real cost is admin-only: for the others a price under it is simply "below the engine price" (and below the floor)
  const toneOf = (r: PriceRow): Tone => {
    const t = priceTone({ price: priceOf(r), engine: r.engine, base: baseOf(r.base, r.floor, rmaPct), rmaPct, baseMarginPct });
    return t === "red" && !isAdmin ? "yellow" : t;
  };

  const summary = useMemo(() => {
    const t = { red: 0, yellow: 0, green: 0, adjusted: 0 };
    for (const r of rows) {
      const tone = toneOf(r);
      if (tone !== "none") t[tone]++;
      const auto = autoOf(r);
      if (auto !== null && !same(priceOf(r), auto)) t.adjusted++;
    }
    return t;
  }, [rows, values]); // eslint-disable-line react-hooks/exhaustive-deps

  const ruled = rows.filter((r) => r.rule);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const changes = rows.filter((r) => !same(priceOf(r), r.price)).map((r) => ({ id: r.id, price: priceOf(r) }));
    const keep = rows.filter((r) => remember[r.id]).map((r) => r.id);
    start(async () => {
      const res = await savePrices(listId, changes, keep);
      setMsg(res.error ? { text: res.error } : { ok: true, text: res.message ?? "Saved." });
      router.refresh();
    });
  };

  const table = (
    <form onSubmit={save} className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" data-testid="price-summary">
        <span className="text-muted-foreground">{summary.adjusted} adjusted</span>
        {ruled.length ? <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">{ruled.length} from client rules</span> : null}
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{summary.green} green: above Base × (1 + RMA_c + {GREEN_EXTRA_PCT} %)</span>
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{summary.yellow} yellow: below the engine price</span>
        {isAdmin ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{summary.red} red: below the real cost</span> : null}
        {!isAdmin && editable ? <span className="text-muted-foreground">You can go down to the floor; below it only the admin (SOP 5.5).</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm" data-tabular>
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-2 text-left font-medium">Model</th>
              <th className="px-2 py-2 text-right font-medium">GB</th>
              {isAdmin ? <><th className="px-2 py-2 text-right font-medium">Base</th><th className="px-2 py-2 text-right font-medium">Real cost</th></> : null}
              <th className="px-2 py-2 text-right font-medium">Engine</th>
              <th className="px-2 py-2 text-right font-medium">Price</th>
              <th className="px-2 py-2 text-right font-medium">Floor</th>
              {isAdmin ? <><th className="px-2 py-2 text-right font-medium">Margin</th><th className="px-2 py-2 text-right font-medium">Markup</th></> : null}
              <th className="px-2 py-2 text-right font-medium">{prevVersion ? `Before (v${prevVersion})` : "Before"}</th>
              {editable ? <th className="px-2 py-2 text-center font-medium" title="Save price − base as this client's rule for the next lists">Remember</th> : null}
              {editable ? <th className="w-10" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = priceOf(r);
              const tone = toneOf(r);
              const mm = r.base !== null ? marginMarkup(p, r.base, baseMarginPct) : null;
              const auto = autoOf(r);
              const changed = auto !== null && !same(p, auto);
              return (
                <tr key={r.id} className="border-b last:border-0" data-testid="pl-row" data-tone={tone} data-rule={r.rule ? "1" : "0"}>
                  <td className="py-1.5 pr-2">{r.label}</td>
                  <td className="px-2 py-1.5 text-right">{r.gb}</td>
                  {isAdmin ? <><td className="px-2 py-1.5 text-right text-muted-foreground">{money(r.base)}</td><td className="px-2 py-1.5 text-right text-muted-foreground">{money(mm?.cost)}</td></> : null}
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{money(r.engine)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {editable ? (
                      <Input value={values[r.id]} inputMode="decimal" aria-label={`Price ${r.label} ${r.gb}`} data-testid="price-input"
                        onChange={(e) => {
                          const v = e.target.value;
                          setValues((x) => ({ ...x, [r.id]: v }));
                          if (r.rule) setRemember((x) => ({ ...x, [r.id]: true })); // a rule row typed again → update its rule
                        }}
                        className={cn("ml-auto h-7 w-24 text-right tabular-nums", TONE[tone])} />
                    ) : <span className={cn("rounded px-1.5 py-0.5", TONE[tone])}>{money(p)}</span>}
                    {r.rule ? <span className="block text-[11px] text-sky-800">rule {signed(r.rule.increment)}</span> : null}
                    {changed ? <span className="block text-[11px] text-muted-foreground">adjusted</span> : null}
                  </td>
                  <td className="px-2 py-1.5 text-right">{money(r.floor)}</td>
                  {isAdmin ? <><td className="px-2 py-1.5 text-right">{pct(mm?.margin ?? null)}</td><td className="px-2 py-1.5 text-right">{pct(mm?.markup ?? null)}</td></> : null}
                  <td className="px-2 py-1.5 text-right text-xs">
                    {r.before ? <>{money(r.before.price)}{r.before.adjusted ? <span className="block text-[11px] text-amber-800">your price then</span> : null}</> : "—"}
                  </td>
                  {editable ? (
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" className="size-4 accent-current" aria-label={`Remember ${r.label} ${r.gb} for this client`} data-testid="remember"
                        checked={!!remember[r.id]} onChange={(e) => setRemember((x) => ({ ...x, [r.id]: e.target.checked }))} />
                    </td>
                  ) : null}
                  {editable ? <td className="w-10"><RemoveRowButton rowId={r.id} listId={listId} /></td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pending} data-testid="save-prices">{pending ? "Saving…" : "Save prices"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setValues(Object.fromEntries(rows.map((r) => [r.id, (autoOf(r) ?? r.price).toFixed(2)]))); setRemember({}); }}>
            Back to the engine / rule prices
          </Button>
          <span className="text-xs text-muted-foreground">Tick “Remember” to keep that price − base as this client&apos;s rule for the next lists.</span>
        </div>
      ) : null}
      {msg ? <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"} data-testid="price-msg">{msg.text}</p> : null}
    </form>
  );

  // amounts to verify for the rows priced by a client rule
  const check = ruled.length ? (
    <div className="mb-4 rounded-md border border-sky-200 bg-sky-50/50 p-3" data-testid="rule-check">
      <p className="mb-2 text-sm font-medium">Client rules used in this list — check the amounts</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm" data-tabular>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Model</th>
              {isAdmin ? <th className="px-2 py-1 text-right font-medium">Base</th> : null}
              <th className="px-2 py-1 text-right font-medium">Rule</th>
              <th className="px-2 py-1 text-right font-medium">= Rule price</th>
              <th className="px-2 py-1 text-right font-medium">vs engine</th>
              <th className="px-2 py-1 text-right font-medium">Before</th>
              <th className="px-2 py-1 text-right font-medium">vs before</th>
            </tr>
          </thead>
          <tbody>
            {ruled.map((r) => (
              <tr key={r.id} className="border-t border-sky-100" data-testid="rule-check-row">
                <td className="py-1 pr-2">{r.label} {r.gb} GB</td>
                {isAdmin ? <td className="px-2 py-1 text-right">{money(r.base)}</td> : null}
                <td className="px-2 py-1 text-right">{signed(r.rule!.increment)}</td>
                <td className="px-2 py-1 text-right font-medium">{money(r.rule!.price)}</td>
                <td className="px-2 py-1 text-right">{r.engine !== null ? signed(r.rule!.price - r.engine) : "—"}</td>
                <td className="px-2 py-1 text-right">{money(r.before?.price)}</td>
                <td className="px-2 py-1 text-right">{r.before ? signed(r.rule!.price - r.before.price) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null;

  return <>{check}{editable ? <EditLock label="Adjust prices" testId="lock-prices">{table}</EditLock> : table}</>;
}
