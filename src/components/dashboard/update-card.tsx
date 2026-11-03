"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { markUpdateSent, undoUpdate } from "@/app/(app)/dashboard/actions";

// One client in the Thursday queue or the RMA ask queue: the draft (editable), Copy, Open chat, Mark as sent.
export function UpdateCard({ accountId, title, subtitle, kind, draft, lang, orderIds, sent, chatHref, accountHref }: {
  accountId: string; title: string; subtitle?: string; kind: "thursday" | "rma_ask"; draft: string; lang: "en" | "es";
  orderIds: string[]; sent: { id: string; when: string } | null; chatHref: string | null; accountHref: string;
}) {
  const [text, setText] = useState(draft);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lines = Math.min(12, Math.max(3, text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 62)), 0)));

  return (
    <div className="grid min-w-0 gap-2 rounded-xl border bg-card p-3" data-testid={`update-${title.split(" ")[0]}`} data-sent={sent ? "1" : "0"}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={accountHref} className="font-medium hover:underline">{title}</Link>
        <Badge variant="outline">{lang.toUpperCase()}</Badge>
        {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
        <span className="ml-auto">
          {sent ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Sent {sent.when}</Badge>
            : <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">To send</Badge>}
        </span>
      </div>
      {!sent ? (
        <>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={lines} className="field-sizing-fixed text-sm leading-relaxed"
            aria-label={`Message for ${title}`} data-testid="update-text" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline"
              onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}>
              {copied ? "Copied" : "Copy"}
            </Button>
            {chatHref ? <Button asChild size="sm" variant="outline"><Link href={chatHref}>Open WhatsApp chat</Link></Button> : null}
            <Button type="button" size="sm" variant="secondary" disabled={pending} data-testid="mark-sent"
              onClick={() => start(async () => {
                setError(null);
                const r = await markUpdateSent({ account_id: accountId, kind, order_ids: orderIds, message: text, language: lang });
                if (r.error) setError(r.error);
              })}>
              {pending ? "Saving…" : "Mark as sent"}
            </Button>
            {text !== draft ? <Button type="button" size="sm" variant="ghost" onClick={() => setText(draft)}>Reset draft</Button> : null}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Done for this week.</span>
          <Button type="button" size="xs" variant="ghost" disabled={pending}
            onClick={() => start(async () => { const r = await undoUpdate(sent.id); if (r.error) setError(r.error); })}>Undo</Button>
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
