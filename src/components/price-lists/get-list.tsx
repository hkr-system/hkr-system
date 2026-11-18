"use client";

import { useState } from "react";
import { Check, Copy, Download, FileText, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import type { D2DChoices } from "@/lib/price-lists/d2d-service";

// "Get price list": Excel and PDF download; plain text and WhatsApp text open ready to copy.
// EU clients (Nov 18 2026): "Prices in" USD (FOB Hong Kong) or door to door in EUR via a company, at a rate (official − spread,
// editable). The company is only chosen here; its name never goes on the file.
export function GetPriceList({ listId, label = "Get price list", d2d }: { listId: string; label?: string; d2d?: D2DChoices }) {
  const [open, setOpen] = useState<null | "txt" | "wa">(null);
  const [mode, setMode] = useState("usd");
  const pick = d2d?.companies.find((c) => c.id === mode) ?? null;
  const [rate, setRate] = useState("");
  const rateFor = (id: string) => { const c = d2d?.companies.find((x) => x.id === id); return c?.suggested ? c.suggested.toFixed(4) : ""; };
  const rateOk = Number(rate) > 0.5 && Number(rate) < 2;
  const qs = pick ? `?mode=d2d&via=${pick.id}&rate=${encodeURIComponent(rate)}` : "";
  const blocked = !!pick && !rateOk;
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const show = async (f: "txt" | "wa") => {
    setOpen(f); setText("Loading…"); setCopied(false);
    const r = await fetch(`/api/price-lists/${listId}/${f}${qs}`, { cache: "no-store" });
    setText(r.ok ? await r.text() : (await r.text().catch(() => "")) || "Could not load the list.");
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className="grid gap-2" data-testid="get-price-list">
      {d2d?.eligible ? (
        <div className="flex flex-wrap items-end gap-2 text-sm" data-testid="price-mode">
          <label className="grid gap-1 text-xs text-muted-foreground">Prices in
            <NativeSelect value={mode} aria-label="Prices in" className="w-72"
              onChange={(e) => { setMode(e.target.value); setRate(rateFor(e.target.value)); }}>
              <option value="usd">USD · FOB Hong Kong (plain)</option>
              {d2d.companies.map((c) => <option key={c.id} value={c.id}>EUR · Door to door via {c.name}</option>)}
            </NativeSelect>
          </label>
          {pick ? (
            <label className="grid gap-1 text-xs text-muted-foreground">Rate: 1 EUR = … USD
              <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className="h-9 w-28 text-right text-foreground" aria-label="EUR to USD rate" />
            </label>
          ) : null}
          {pick ? (
            <span className="pb-2 text-xs text-muted-foreground" data-testid="rate-hint">
              {d2d.fx ? `Official ${d2d.fx.rate.toFixed(4)} (${d2d.fx.date}) − spread ${pick.spread}` : "Official rate not reachable now: type it."} · the company name is not on the file
            </span>
          ) : null}
          {!d2d.companies.length ? <span className="pb-2 text-xs text-muted-foreground">Door to door: no company set up yet (admin: Settings → Intermediaries &amp; clearance).</span> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{label}:</span>
      {blocked ? <span className="text-xs text-destructive">Write the rate first.</span> : <>
      <Button asChild size="sm" variant="outline"><a href={`/api/price-lists/${listId}/xlsx${qs}`}><Download className="size-3.5" /> Excel</a></Button>
      <Button asChild size="sm" variant="outline"><a href={`/api/price-lists/${listId}/pdf${qs}`} target="_blank" rel="noreferrer"><FileText className="size-3.5" /> PDF</a></Button>
      <Button size="sm" variant="outline" onClick={() => show("txt")}><FileText className="size-3.5" /> Text</Button>
      <Button size="sm" variant="outline" onClick={() => show("wa")}><MessageCircle className="size-3.5" /> WhatsApp text</Button>
      </>}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{open === "wa" ? "WhatsApp text" : "Plain text"}</DialogTitle>
            <DialogDescription>{open === "wa" ? "Paste it in the client group: *bold* shows as bold in WhatsApp." : "For email or any other channel."}</DialogDescription>
          </DialogHeader>
          {/* fixed height: the list scrolls inside the box instead of growing past the screen */}
          <Textarea value={text} readOnly className="field-sizing-fixed h-[min(55vh,520px)] resize-none overflow-y-auto font-mono text-xs leading-relaxed" data-testid="price-list-text" />
          <div><Button size="sm" onClick={copy}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
