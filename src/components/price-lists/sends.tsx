"use client";

import { useState, useTransition } from "react";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { deleteListSend, markListSent } from "@/app/(app)/price-lists/actions";
import type { D2DChoices } from "@/lib/price-lists/d2d-service";

export type SendRow = { id: string; sentOn: string; channel: string; note: string | null; by: string | null; mine: boolean; what?: string };
const CHANNELS: [string, string][] = [["whatsapp", "WhatsApp"], ["email", "Email"], ["portal", "Client portal"], ["in_person", "In person"], ["other", "Other"]];
const label = (c: string) => CHANNELS.find((x) => x[0] === c)?.[1] ?? c;

// "Sent to the client" on a client price list (Gabriel, Nov 18 2026): record each time this version went to the client.
export function ListSends({ listId, sends, today, canDeleteAll, compact = false, d2d }: { listId: string; sends: SendRow[]; today: string; canDeleteAll: boolean; compact?: boolean; d2d?: D2DChoices }) {
  const [what, setWhat] = useState("usd");
  const [rate, setRate] = useState("");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [channel, setChannel] = useState("whatsapp");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ ok?: boolean; error?: string; message?: string }>) =>
    start(async () => { const r = await f(); setMsg(r.error ? { text: r.error } : { ok: true, text: r.message ?? "Saved." }); if (!r.error) { setOpen(false); setNote(""); } });
  return (
    <div className="grid gap-2 text-sm" data-testid="list-sends">
      {!compact ? (
        sends.length ? (
          <ul className="grid gap-1">
            {sends.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-2" data-testid="list-send">
                <span className="font-medium">{s.sentOn}</span><span>· {label(s.channel)}</span>{s.what ? <span>· {s.what}</span> : null}
                {s.by ? <span className="text-muted-foreground">· by {s.by}</span> : null}
                {s.note ? <span className="text-muted-foreground">· {s.note}</span> : null}
                {s.mine || canDeleteAll ? (
                  <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Remove this send" disabled={pending} onClick={() => run(() => deleteListSend(s.id))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-muted-foreground">Not marked as sent to the client yet.</p>
      ) : null}
      {open ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">Sent on
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-8 w-40 text-foreground" aria-label="Sent on" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">How
            <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Sent by" className="w-40">
              {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </label>
          {d2d?.eligible && d2d.companies.length ? (
            <label className="grid gap-1 text-xs text-muted-foreground">What was sent
              <NativeSelect value={what} aria-label="What was sent" className="w-64"
                onChange={(e) => { setWhat(e.target.value); const c = d2d.companies.find((x) => x.id === e.target.value); setRate(c?.suggested ? c.suggested.toFixed(4) : ""); }}>
                <option value="usd">USD · FOB Hong Kong</option>
                {d2d.companies.map((c) => <option key={c.id} value={c.id}>EUR · Door to door via {c.name}</option>)}
              </NativeSelect>
            </label>
          ) : null}
          {what !== "usd" ? (
            <label className="grid gap-1 text-xs text-muted-foreground">Rate used
              <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className="h-8 w-24 text-right text-foreground" aria-label="Rate used" />
            </label>
          ) : null}
          <label className="grid flex-1 gap-1 text-xs text-muted-foreground">Note (optional)
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. sent to Jana on WhatsApp" className="h-8 min-w-48 text-foreground" aria-label="Send note" />
          </label>
          <Button type="button" size="sm" disabled={pending} data-testid="send-save" onClick={() => run(() => markListSent(listId, date, channel, note, what === "usd" ? { variant: "usd" } : { variant: "d2d", via: what, rate: Number(rate) }))}>{pending ? "Saving…" : "Save"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      ) : (
        <div><Button type="button" size="sm" variant="outline" data-testid="mark-sent" onClick={() => { setOpen(true); setMsg(null); }}>
          <Send className="size-4" /> Mark as sent to the client
        </Button></div>
      )}
      {msg ? <p className={msg.ok ? "text-emerald-700" : "text-destructive"} role="status">{msg.text}</p> : null}
    </div>
  );
}
