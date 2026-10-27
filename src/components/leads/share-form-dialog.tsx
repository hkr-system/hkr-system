"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/native-select";

type Owner = { user_id: string; full_name: string };

const CHANNELS: { src: string; label: string; hint: string }[] = [
  { src: "wa", label: "WhatsApp", hint: "Paste in a chat or group" },
  { src: "email", label: "Email", hint: "Cold email or follow-up" },
  { src: "linkedin", label: "LinkedIn", hint: "Message or post" },
  { src: "expo", label: "Trade show", hint: "Stand QR or printed card" },
  { src: "direct", label: "Direct", hint: "Any other place" },
];

function slug(name: string) {
  return name.replace(/\s*\(demo\)/i, "").split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// "Share form": the public /apply link per channel and owner, with copy buttons and a QR for the stand.
// What the lead chooses in the link lands in lead_form_submissions.src / ref.
export function ShareFormDialog({ baseUrl, owners, currentUserId }: { baseUrl: string; owners: Owner[]; currentUserId: string }) {
  const [owner, setOwner] = useState(owners.find((o) => o.user_id === currentUserId)?.user_id ?? owners[0]?.user_id ?? "");
  const [lang, setLang] = useState<"es" | "en">("es");
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState<string>("");

  const ref = slug(owners.find((o) => o.user_id === owner)?.full_name ?? "");
  const links = useMemo(() => CHANNELS.map((c) => {
    const u = new URL("/apply", baseUrl);
    if (lang === "es") u.searchParams.set("lang", "es");
    u.searchParams.set("src", c.src);
    if (ref) u.searchParams.set("ref", ref);
    return { ...c, url: u.toString() };
  }), [baseUrl, lang, ref]);

  useEffect(() => {
    const expo = links.find((l) => l.src === "expo")!.url;
    QRCode.toDataURL(expo, { width: 480, margin: 1, color: { dark: "#0f1a33", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
  }, [links]);

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="share-form"><Link2 className="size-4" /> Share form</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share the price-list form</DialogTitle>
          <DialogDescription>Each link tells the system which channel and who shared it. The lead sees the landing at /apply.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Language
            <NativeSelect value={lang} onChange={(e) => setLang(e.target.value as "es" | "en")}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Shared by
            <NativeSelect value={owner} onChange={(e) => setOwner(e.target.value)}>
              {owners.map((o) => <option key={o.user_id} value={o.user_id}>{o.full_name}</option>)}
            </NativeSelect>
          </label>
        </div>
        <div className="grid gap-2">
          {links.map((l) => (
            <div key={l.src} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{l.label} <span className="font-normal text-muted-foreground">· {l.hint}</span></div>
                <div className="truncate font-mono text-xs text-muted-foreground" title={l.url}>{l.url}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => copy(l.url)} data-testid={`copy-${l.src}`}>{copied === l.url ? "Copied" : "Copy"}</Button>
            </div>
          ))}
        </div>
        {qr ? (
          <div className="flex items-center gap-4 rounded-lg border bg-card p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code of the trade-show link" className="size-28 rounded" />
            <div className="text-sm text-muted-foreground">
              QR for the stand: opens the trade-show link. Right-click to save the image for printing.
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
