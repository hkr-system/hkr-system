"use client";

import { Children, isValidElement, useState } from "react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/orders/constants";

// Order page in tabs like the account page (Gabriel, Nov 3 2026: "click and the tab opens, no endless scrolling").
// Every panel is already loaded: switching is instant; the tab is kept in the address (?tab=) for links and reloads.
export function OrderTabs({ tabs, initial, children }: {
  tabs: { key: string; label: string; count?: number; alert?: boolean; note?: string }[]; initial: string; children: React.ReactNode;
}) {
  const [tab, setTab] = useState(tabs.some((t) => t.key === initial) ? initial : tabs[0].key);
  const pick = (k: string) => {
    setTab(k);
    try { const u = new URL(window.location.href); u.searchParams.set("tab", k); window.history.replaceState(null, "", u); } catch { /* ignore */ }
  };
  return (
    <>
      <div className="sticky top-0 z-20 -mx-1 mb-4 flex gap-1 overflow-x-auto border-b bg-background px-1" role="tablist" data-testid="order-tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => pick(t.key)} data-testid={`tab-${t.key}`}
            className={cn("-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              tab === t.key && "border-foreground font-medium text-foreground")}>
            {t.label}
            {t.count ? <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{t.count}</span> : null}
            {t.note ? <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{t.note}</span> : null}
            {t.alert ? <span className="size-2 rounded-full bg-amber-500" aria-label="needs attention" /> : null}
          </button>
        ))}
      </div>
      {Children.map(children, (c) => {
        if (!isValidElement<{ "data-tab"?: string }>(c)) return c;
        const key = c.props["data-tab"];
        return <div hidden={key !== tab} role="tabpanel" className="min-w-0">{c}</div>;
      })}
    </>
  );
}

// Money indicators at the top of the order, always visible: invoice total, received (confirmed by an admin),
// waiting for confirmation, still due (red until paid in full, then green) and the next amount to ask for.
export function OrderIndicators({ total, received, awaiting, due, nextDue }: {
  total: number; received: number; awaiting: number; due: number; nextDue: { label: string; amount: number } | null;
}) {
  const tile = "rounded-xl border bg-card p-3";
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="order-indicators">
      <div className={tile}><div className="text-xs text-muted-foreground">Invoice total</div><div className="mt-1 text-lg font-semibold tabular-nums">{money(total)}</div></div>
      <div className={cn(tile, "border-emerald-200 bg-emerald-50/60")}><div className="text-xs text-emerald-800">Received (confirmed)</div><div className="mt-1 text-lg font-semibold tabular-nums text-emerald-800" data-testid="ind-received">{money(received)}</div></div>
      <div className={cn(tile, awaiting > 0 && "border-amber-300 bg-amber-50/70")}><div className={cn("text-xs", awaiting > 0 ? "text-amber-900" : "text-muted-foreground")}>Waiting for confirmation</div><div className={cn("mt-1 text-lg font-semibold tabular-nums", awaiting > 0 ? "text-amber-900" : "text-muted-foreground")} data-testid="ind-awaiting">{money(awaiting)}</div></div>
      <div className={cn(tile, due > 0 ? "border-red-300 bg-red-50/70" : "border-emerald-300 bg-emerald-50/70")}>
        <div className={cn("text-xs", due > 0 ? "text-red-800" : "text-emerald-800")}>{due > 0 ? "Still due" : "Paid in full"}</div>
        <div className={cn("mt-1 text-lg font-semibold tabular-nums", due > 0 ? "text-red-700" : "text-emerald-700")} data-testid="ind-due">{money(due)}</div>
      </div>
      <div className={cn(tile, "col-span-2 md:col-span-1", nextDue && "border-hkr-accent/50")}>
        <div className="text-xs text-muted-foreground">{nextDue ? nextDue.label : "Next amount to ask for"}</div>
        <div className="mt-1 text-lg font-semibold tabular-nums">{nextDue ? money(nextDue.amount) : "—"}</div>
      </div>
    </div>
  );
}
