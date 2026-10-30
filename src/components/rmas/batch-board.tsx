import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/orders/constants";
import type { BoardColumn, Tone } from "@/lib/rmas/board";

// EU batches left to right by stage (Gabriel, Oct 30 2026). Each card jumps to its batch below.
const STAGE_STYLE = {
  open: "bg-amber-50 text-amber-800",
  shipped: "bg-sky-50 text-sky-800",
  received: "bg-emerald-50 text-emerald-800",
} as const;
const TONE: Record<Tone, string> = { warn: "text-amber-700", ok: "text-emerald-700", muted: "text-muted-foreground", danger: "text-hkr-action" };

export function BatchBoard({ columns }: { columns: BoardColumn[] }) {
  return (
    <section className="mb-6 grid gap-3" aria-label="Batches by stage" data-testid="batch-board">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {columns.map((c, i) => (
          <span key={c.key} className="flex items-center gap-1.5">
            <span className={cn("rounded-md px-2 py-1 font-medium", STAGE_STYLE[c.key])}>{c.n} {c.label} · {c.hint}</span>
            {i < columns.length - 1 ? <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden /> : null}
          </span>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((c) => (
          <div key={c.key} className="grid content-start gap-2 rounded-xl bg-hkr-bg-2 p-3" data-testid={`stage-${c.key}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Stage {c.n} · {c.label}</h2>
              <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", STAGE_STYLE[c.key])} data-testid={`stage-${c.key}-count`}>
                {c.cards.length} batch{c.cards.length === 1 ? "" : "es"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{c.summary}</p>
            {c.cards.map((card) => (
              <a key={card.id} href={`#batch-${card.id}`} className="grid gap-0.5 rounded-md border bg-card p-2.5 text-xs hover:border-hkr-accent" data-testid="batch-card">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{card.title}</span>
                  <span className={cn("shrink-0 text-right", TONE[card.whenTone])}>{card.when}</span>
                </span>
                <span className="text-muted-foreground" data-tabular>{card.units} unit{card.units === 1 ? "" : "s"} · {card.clients} client{card.clients === 1 ? "" : "s"}{card.value ? ` · ${money(card.value)}` : ""}</span>
                {card.notes.map((n) => <span key={n.text} className={TONE[n.tone]}>{n.text}</span>)}
              </a>
            ))}
            {!c.cards.length ? <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No batches</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
