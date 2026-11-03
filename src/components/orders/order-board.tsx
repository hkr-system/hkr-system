import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/orders/constants";
import type { OrderColumn, Tone } from "@/lib/orders/board";

// Orders left to right by status (Gabriel, Nov 3 2026). Columns scroll sideways inside the board, never the page.
const TONE: Record<Tone, string> = { warn: "text-amber-700", ok: "text-emerald-700", muted: "text-muted-foreground", danger: "text-hkr-action" };

export function OrderBoard({ columns }: { columns: OrderColumn[] }) {
  return (
    <section className="grid gap-3" aria-label="Orders by status" data-testid="order-board">
      {/* every stage at a glance (the columns below scroll sideways) */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="board-strip">
        {columns.map((c, i) => (
          <span key={c.status} className="flex items-center gap-1.5">
            <a href={`#col-${c.status}`} className={cn("rounded-md border bg-card px-2 py-1 hover:border-hkr-accent", c.alerts ? "border-hkr-action/40" : "")}>
              {c.n} {c.label} <span className="font-semibold">{c.cards.length}</span>{c.alerts ? <span className="text-hkr-action"> · {c.alerts}!</span> : null}
            </a>
            {i < columns.length - 1 ? <ArrowRight className="size-3 text-muted-foreground" aria-hidden /> : null}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col items-start gap-3">
          {columns.map((c) => (
            <div key={c.status} id={`col-${c.status}`} className="grid scroll-ml-4 content-start gap-2 rounded-xl bg-hkr-bg-2 p-3" data-testid={`col-${c.status}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{c.n} · {c.label}</h2>
                <span className="rounded-md bg-card px-2 py-0.5 text-xs font-medium" data-testid={`col-${c.status}-count`}>{c.cards.length}</span>
              </div>
              <p className="text-xs text-muted-foreground" data-tabular>
                {money(c.value)} · {c.units} pcs{c.alerts ? <span className="text-hkr-action"> · {c.alerts} need action</span> : null}
              </p>
              {c.cards.map((card) => (
                <Link key={card.id} href={`/orders/${card.id}`} className="grid gap-0.5 rounded-md border bg-card p-2.5 text-xs hover:border-hkr-accent" data-testid="order-card">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{card.title}</span>
                    <span className="shrink-0 text-muted-foreground">{card.daysText}</span>
                  </span>
                  <span className="text-muted-foreground" data-tabular>{card.units} pcs · {money(card.value)}</span>
                  {card.notes.map((n) => <span key={n.text} className={cn(TONE[n.tone])}>{n.text}</span>)}
                </Link>
              ))}
              {!c.cards.length ? <p className="py-2 text-center text-xs text-muted-foreground">—</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
