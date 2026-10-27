"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/native-select";

export function SectionTabs({ tabs }: { tabs: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b" data-testid="section-tabs">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href}
            className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              active && "border-foreground font-medium text-foreground")}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export const PERIODS = [
  ["30", "Last 30 days"], ["90", "Last 90 days"], ["180", "Last 6 months"], ["365", "Last 12 months"], ["ytd", "This year"],
] as const;

export function PeriodControls({ showGrain = true }: { showGrain?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    if (k === "period") next.delete("grain");
    start(() => router.push(`${pathname}?${next.toString()}`));
  };
  return (
    <div className="flex items-center gap-2" aria-busy={pending}>
      <NativeSelect value={params.get("period") ?? "90"} onChange={(e) => set("period", e.target.value)} className="w-auto" aria-label="Period" data-testid="period">
        {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </NativeSelect>
      {showGrain ? (
        <div className="flex rounded-lg border p-0.5 text-xs" role="group" aria-label="Group by">
          {(["day", "week", "month"] as const).map((g) => {
            const cur = params.get("grain") ?? defaultGrain(params.get("period") ?? "90");
            return (
              <button key={g} type="button" onClick={() => set("grain", g)} data-testid={`grain-${g}`}
                className={cn("rounded-md px-2.5 py-1 capitalize", cur === g ? "bg-hkr-ink text-white" : "text-muted-foreground hover:text-foreground")}>
                {g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function defaultGrain(period: string): "day" | "week" | "month" {
  return period === "30" ? "day" : period === "90" ? "week" : "month";
}
