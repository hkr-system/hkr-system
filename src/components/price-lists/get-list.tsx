"use client";

import { useState } from "react";
import { Check, Copy, Download, FileText, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// "Get price list": Excel and PDF download; plain text and WhatsApp text open ready to copy.
export function GetPriceList({ listId, label = "Get price list" }: { listId: string; label?: string }) {
  const [open, setOpen] = useState<null | "txt" | "wa">(null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const show = async (f: "txt" | "wa") => {
    setOpen(f); setText("Loading…"); setCopied(false);
    const r = await fetch(`/api/price-lists/${listId}/${f}`, { cache: "no-store" });
    setText(r.ok ? await r.text() : "Could not load the list.");
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="get-price-list">
      <span className="text-sm font-medium">{label}:</span>
      <Button asChild size="sm" variant="outline"><a href={`/api/price-lists/${listId}/xlsx`}><Download className="size-3.5" /> Excel</a></Button>
      <Button asChild size="sm" variant="outline"><a href={`/api/price-lists/${listId}/pdf`} target="_blank" rel="noreferrer"><FileText className="size-3.5" /> PDF</a></Button>
      <Button size="sm" variant="outline" onClick={() => show("txt")}><FileText className="size-3.5" /> Text</Button>
      <Button size="sm" variant="outline" onClick={() => show("wa")}><MessageCircle className="size-3.5" /> WhatsApp text</Button>
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
