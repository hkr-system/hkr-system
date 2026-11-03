import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MonthPicker } from "./month-picker";
import { cn } from "@/lib/utils";
import { money } from "@/lib/orders/constants";
import type { OrderColumn, Tone } from "@/lib/orders/board";

// Orders left to right by status (Gabriel, Nov 3 2026). Columns scroll sideways inside the board, never the page.
const TONE: Record<Tone, string> = { warn: "text-amber-700", ok: "text-emerald-700", muted: "text-muted-foreground", danger: "text-hkr-action" };

/** Link that keeps the other filter: ?status=…&month=… */
const href = (status: string | null, month: string) => `/sales/board?${new URLSearchParams({ ...(status ? { status } : {}), month }).toString()}`;

export function OrderBoard({ columns, status, month, months, monthLabel }: {
  columns: OrderColumn[]; status: string | null; month: string; months: { value: string; label: string }[]; monthLabel: string;
}) {
  const shown = status ? columns.filter((c) => c.status === status) : columns;
  return (
    <section className="grid gap-3" aria-label="Orders by status" data-testid="order-board">
      {/* filters: one status (click a stage) and the month of the CLOSED orders */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="board-strip">
        <Link href={href(null, month)} className={cn("rounded-md border px-2 py-1 hover:border-hkr-accent", !status ? "border-hkr-ink bg-hkr-ink/5 font-semibold" : "bg-card")}>All</Link>
        {columns.map((c, i) => (
          <span key={c.status} className="flex items-center gap-1.5">
            <Link href={href(status === c.status ? null : c.status, month)} data-testid={`filter-${c.status}`}
              className={cn("rounded-md border px-2 py-1 hover:border-hkr-accent", status === c.status ? "border-hkr-ink bg-hkr-ink/5" : "bg-card", c.alerts && status !== c.status ? "border-hkr-action/40" : "")}>
              {c.n} {c.label} <span className="font-semibold">{c.cards.length}</span>{c.alerts ? <span className="text-hkr-action"> · {c.alerts}!</span> : null}
            </Link>
            {i < columns.length - 1 ? <ArrowRight className="size-3 text-muted-foreground" aria-hidden /> : null}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Closed orders of</span>
        <MonthPicker month={month} months={months} status={status} />
        <span className="text-xs text-muted-foreground">Open orders always show until they are closed.</span>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className={cn("grid items-start gap-3", status ? "max-w-md" : "auto-cols-[minmax(230px,1fr)] grid-flow-col")}>
          {shown.map((c) => (
            <div key={c.status} id={`col-${c.status}`} className="grid scroll-ml-4 content-start gap-2 rounded-xl bg-hkr-bg-2 p-3" data-testid={`col-${c.status}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{c.n} · {c.label}</h2>
                <span className="rounded-md bg-card px-2 py-0.5 text-xs font-medium" data-testid={`col-${c.status}-count`}>{c.cards.length}</span>
              </div>
              {c.status === "closed" ? <p className="text-xs font-medium">{monthLabel}</p> : null}
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
