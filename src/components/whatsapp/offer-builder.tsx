"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { offerEurPrices } from "@/app/(app)/whatsapp/offers/actions";
import type { D2DChoices } from "@/lib/price-lists/d2d-service";
import { money2 } from "@/lib/price-lists/outputs";
import { offerKey, offerMoney, offerText, rankDrops, type BaseRow, type OfferRegion } from "@/lib/whatsapp/offer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Per-viewer conveniences (the battery price and the US door-to-door amount are typed per offer and remembered here).
const load = (k: string) => { try { return localStorage.getItem(`hkr-offer:${k}`) ?? ""; } catch { return ""; } };
const save = (k: string, v: string) => { try { localStorage.setItem(`hkr-offer:${k}`, v); } catch { /* storage blocked */ } };

export function OfferBuilder({ rows, d2d }: { rows: BaseRow[]; d2d: D2DChoices }) {
  const ranked = useMemo(() => rankDrops(rows), [rows]);
  // drops first (biggest first), then every other model so any can be added
  const ordered = useMemo(() => {
    const keys = new Set(ranked.map(offerKey));
    return [...ranked, ...rows.filter((r) => !keys.has(offerKey(r))).map((r) => ({ ...r, drop: null as number | null }))];
  }, [ranked, rows]);
  const [region, setRegion] = useState<OfferRegion>("eu");
  const [picked, setPicked] = useState<string[]>(() => ranked.slice(0, 3).map(offerKey));
  const [qty, setQty] = useState<Record<string, string>>({});
  const defaultVia = d2d.companies.find((c) => /barry/i.test(c.name)) ?? d2d.companies[0];
  const [via, setVia] = useState(defaultVia?.id ?? "");
  const [rate, setRate] = useState(defaultVia?.suggested ? defaultVia.suggested.toFixed(4) : "");
  // prices of one route + rate (the key says which, so a stale answer is never shown)
  const [eurState, setEurState] = useState<{ key: string; prices: Record<string, number> | null; error: string | null } | null>(null);
  const [pending, start] = useTransition();
  const [battery, setBattery] = useState({ eu: "", us: "" });
  const [usAdd, setUsAdd] = useState("");
  const [edited, setEdited] = useState<{ base: string; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- read the remembered values once, after hydration (no localStorage on the server)
  useEffect(() => { setBattery({ eu: load("battery-eu"), us: load("battery-us") }); setUsAdd(load("us-add")); }, []);

  // EUR door-to-door prices for the chosen route and rate (computed on the server: the companies' fees stay there)
  const eurKey = region === "eu" && via && Number(rate) > 0.5 && Number(rate) < 2 ? `${via}|${Number(rate)}` : null;
  useEffect(() => {
    if (!eurKey) return;
    const t = setTimeout(() => start(async () => {
      const [v, r] = eurKey.split("|");
      const out = await offerEurPrices(v, Number(r));
      setEurState({ key: eurKey, prices: out.prices ?? null, error: out.error ?? null });
    }), 300);
    return () => clearTimeout(t);
  }, [eurKey]);
  const eur = eurKey && eurState?.key === eurKey ? eurState.prices : null;
  const eurError = eurKey && eurState?.key === eurKey ? eurState.error : null;

  const add = Number(usAdd.replace(",", ".")) || 0;
  const priceOf = (r: BaseRow) => (region === "eu" ? eur?.[offerKey(r)] ?? null : Math.round((r.price_usd + add) * 100) / 100);
  const items = ordered.filter((r) => picked.includes(offerKey(r))).flatMap((r) => {
    const p = priceOf(r);
    return p === null ? [] : [{ model: r.model, storage_gb: r.storage_gb, price: p, qty: qty[offerKey(r)] ?? "" }];
  });
  const bat = region === "eu" ? battery.eu : battery.us;
  const generated = offerText(region, items, bat ? `${region === "eu" ? "€" : "$"}${bat}` : region === "eu" ? "€?" : "$?");
  // a touch-up is kept until anything on the left changes (then the message is rebuilt)
  const text = edited && edited.base === generated ? edited.text : generated;

  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(text); } catch { setCopied(null); } };
  const missing = [!bat && "the new-battery price", region === "eu" && !eur && "the route and rate", !items.length && "at least one model"].filter(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]" data-testid="offer-builder">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Market and prices</CardTitle>
          <CardDescription>Base list with no extra margin. Europe: EUR door to door through the route; US / LATAM: US$ + the door-to-door amount per unit.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="grid gap-1 text-xs text-muted-foreground">Market
              <NativeSelect value={region} aria-label="Market" className="w-64" onChange={(e) => setRegion(e.target.value as OfferRegion)}>
                <option value="eu">Europe · EUR door to door</option>
                <option value="us">US / LATAM · US$ door to door</option>
              </NativeSelect>
            </label>
            {region === "eu" ? (
              <>
                <label className="grid gap-1 text-xs text-muted-foreground">Route
                  <NativeSelect value={via} aria-label="Route" className="w-56"
                    onChange={(e) => { setVia(e.target.value); const c = d2d.companies.find((x) => x.id === e.target.value); setRate(c?.suggested ? c.suggested.toFixed(4) : ""); }}>
                    {!d2d.companies.length ? <option value="">No company set up</option> : null}
                    {d2d.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">Rate: 1 EUR = … USD
                  <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className="h-9 w-28 text-right text-foreground" aria-label="EUR to USD rate" />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">New battery + € / unit
                  <Input value={battery.eu} placeholder="e.g. 8.6" inputMode="decimal" className="h-9 w-24 text-right text-foreground" aria-label="New battery EUR"
                    onChange={(e) => { setBattery((b) => ({ ...b, eu: e.target.value })); save("battery-eu", e.target.value); }} />
                </label>
              </>
            ) : (
              <>
                <label className="grid gap-1 text-xs text-muted-foreground">Door to door + US$ / unit
                  <Input value={usAdd} placeholder="e.g. 12" inputMode="decimal" className="h-9 w-28 text-right text-foreground" aria-label="US door to door per unit"
                    onChange={(e) => { setUsAdd(e.target.value); save("us-add", e.target.value); }} />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">New battery + US$ / unit
                  <Input value={battery.us} placeholder="e.g. 10" inputMode="decimal" className="h-9 w-24 text-right text-foreground" aria-label="New battery USD"
                    onChange={(e) => { setBattery((b) => ({ ...b, us: e.target.value })); save("battery-us", e.target.value); }} />
                </label>
              </>
            )}
          </div>
          {region === "eu" ? (
            <p className="text-xs text-muted-foreground" data-testid="offer-rate-hint">
              {d2d.fx ? `Official ${d2d.fx.rate.toFixed(4)} (${d2d.fx.date}) − the route's spread.` : "Official rate not reachable now: type it."}
              {pending ? " Calculating…" : ""}{eurError ? <span className="text-destructive"> {eurError}</span> : null}
            </p>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium">2 · Models <span className="font-normal text-muted-foreground">— the 3 that dropped most (US$) are ticked; tick or untick any, type the quantity.</span></p>
            <Table data-testid="offer-models">
              <TableHeader>
                <TableRow><TableHead className="w-8" /><TableHead>Model</TableHead><TableHead className="text-right">Base now</TableHead><TableHead className="text-right">Before</TableHead><TableHead className="text-right">Drop</TableHead><TableHead className="text-right">Offer price</TableHead><TableHead>Qty (pcs)</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((r) => {
                  const k = offerKey(r); const on = picked.includes(k); const p = priceOf(r);
                  return (
                    <TableRow key={k} data-testid="offer-row" className={cn(on && "bg-hkr-accent-tint/40")}>
                      <TableCell><input type="checkbox" checked={on} onChange={() => toggle(k)} aria-label={`Offer ${r.model} ${r.storage_gb}GB`} className="size-4" /></TableCell>
                      <TableCell className="whitespace-nowrap">{r.model} {r.storage_gb}GB</TableCell>
                      <TableCell className="text-right">{money2(r.price_usd)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.prev_price_usd === null ? "new" : money2(r.prev_price_usd)}</TableCell>
                      <TableCell className={cn("text-right", r.drop ? "font-medium text-emerald-700" : "text-muted-foreground")}>
                        {r.drop ? `▼ -${money2(r.drop)}` : r.prev_price_usd !== null && r.price_usd > r.prev_price_usd ? <span className="text-hkr-action">▲ +{money2(r.price_usd - r.prev_price_usd)}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right">{p === null ? "—" : offerMoney(p, region === "eu" ? "EUR" : "USD")}</TableCell>
                      <TableCell>{on ? <Input value={qty[k] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [k]: e.target.value }))} placeholder="e.g. 1000" className="h-8 w-24" aria-label={`Quantity ${r.model} ${r.storage_gb}GB`} /> : null}</TableCell>
                    </TableRow>
                  );
                })}
                {!ordered.length ? <TableRow><TableCell colSpan={7} className="text-muted-foreground">No base list yet.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader>
          <CardTitle className="text-base">3 · Message</CardTitle>
          <CardDescription>Ready for WhatsApp (*bold*). You can touch it up here before copying; changing anything on the left rebuilds it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {missing.length ? <p className="text-xs text-amber-800" data-testid="offer-missing">Still missing: {missing.join(", ")}.</p> : null}
          <Textarea value={text} onChange={(e) => setEdited({ base: generated, text: e.target.value })} className="field-sizing-fixed h-[min(60vh,560px)] resize-none overflow-y-auto font-mono text-xs leading-relaxed" data-testid="offer-text" aria-label="Offer message" />
          <div><Button size="sm" onClick={copy} data-testid="offer-copy">{copied === text ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied === text ? "Copied" : "Copy message"}</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
