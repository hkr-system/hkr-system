import Link from "next/link";
import { cn } from "@/lib/utils";

// Small, dependency-free chart pieces (single series, one hue: --viz-1).
// Values are always printed next to the bar in text colour; hover shows the exact figure.

export function StatTile({ label, value, sub, href, tone }: {
  label: string; value: string | number; sub?: React.ReactNode; href?: string; tone?: "attention";
}) {
  const body = (
    <div className={cn("h-full rounded-xl border bg-card p-4 transition-colors", href && "hover:bg-muted/50",
      tone === "attention" && Number(value) > 0 && "border-amber-300 dark:border-amber-800")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function BarList({ rows, empty = "No data", format }: {
  rows: { label: string; value: number; href?: string; hint?: string }[]; empty?: string; format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {rows.map((r) => {
        const inner = (
          <div className="grid grid-cols-[minmax(84px,40%)_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${format ? format(r.value) : r.value}${r.hint ? ` · ${r.hint}` : ""}`}>
            <span className="truncate text-muted-foreground">{r.label}</span>
            <span className="h-4 rounded-r-[4px] bg-[var(--viz-track)]">
              <span className="block h-full rounded-r-[4px] bg-[var(--viz-1)]" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className={cn("text-right font-medium tabular-nums", format ? "min-w-16" : "w-10")}>{format ? format(r.value) : r.value}</span>
          </div>
        );
        return <li key={r.label}>{r.href ? <Link href={r.href} className="block rounded-md hover:bg-muted/50">{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}

// Funnel: one bar per stage = leads that ever reached it; % = share of the previous stage.
export function Funnel({ rows }: { rows: { stage: string; reached: number; current: number; href: string }[] }) {
  const top = Math.max(1, rows[0]?.reached ?? 1);
  return (
    <ol className="grid gap-1.5" data-testid="funnel">
      {rows.map((r, i) => {
        const prev = i ? rows[i - 1].reached : null;
        const pct = prev ? Math.round((r.reached / Math.max(1, prev)) * 100) : null;
        return (
          <li key={r.stage}>
            <Link href={r.href} className="grid grid-cols-[112px_1fr_120px] items-center gap-3 rounded-md px-1 py-0.5 text-sm hover:bg-muted/50"
              title={`${r.stage}: ${r.reached} reached${pct !== null ? ` (${pct}% of previous stage)` : ""}; ${r.current} there now`}>
              <span className="truncate">{r.stage}</span>
              <span className="flex h-6 items-center">
                <span className="h-full rounded-r-[4px] bg-[var(--viz-1)]" style={{ width: `${Math.max(1.5, (r.reached / top) * 100)}%` }} />
                <span className="ml-2 font-medium tabular-nums">{r.reached}</span>
              </span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {pct !== null ? `${pct}% · ` : ""}{r.current} now
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function compactUsd(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${(n / 1_000).toFixed(a >= 100_000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

// Column chart over time: one series (--viz-1), optional dashed goal line, hover shows the exact
// figures. No chart library: plain HTML so it renders on the server and in both themes.
export function ColumnChart({ points, format = compactUsd, goal, goalLabel = "Goal", height = 200, testId }: {
  points: { key: string; label: string; value: number; detail?: string; goal?: number | null }[];
  format?: (n: number) => string; goal?: number | null; goalLabel?: string; height?: number; testId?: string;
}) {
  const goals = points.map((p) => p.goal ?? goal ?? 0);
  const max = Math.max(1, ...points.map((p) => p.value), ...goals) * 1.1;
  const every = Math.max(1, Math.ceil(points.length / 10));
  const grid = [0.25, 0.5, 0.75, 1].map((f) => max * f);
  return (
    <div data-testid={testId}>
      <div className="relative ml-12" style={{ height }}>
        {grid.map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ bottom: `${(g / max) * 100}%` }}>
            <span className="absolute -left-12 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums">{format(g)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {points.map((p, i) => {
            const g = goals[i];
            return (
              <div key={p.key} className="group relative flex h-full flex-1 items-end justify-center">
                {g ? <div className="absolute inset-x-0 z-10 border-t-2 border-dashed border-[var(--hkr-ink-2,#4b5a7c)]" style={{ bottom: `${(g / max) * 100}%` }} /> : null}
                <div className="w-full max-w-10 rounded-t-[4px] bg-[var(--viz-1)] transition-opacity group-hover:opacity-80"
                  style={{ height: `${Math.max(p.value > 0 ? 1 : 0, (p.value / max) * 100)}%` }} />
                <div className="pointer-events-none absolute bottom-full z-20 mb-1 hidden w-max max-w-56 rounded-md border bg-popover px-2 py-1 text-xs shadow group-hover:block">
                  <div className="font-medium">{p.label}</div>
                  <div className="tabular-nums">{format(p.value)}{g ? ` · ${goalLabel.toLowerCase()} ${format(g)}` : ""}</div>
                  {p.detail ? <div className="text-muted-foreground">{p.detail}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ml-12 mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
        {points.map((p, i) => <div key={p.key} className="flex-1 truncate text-center">{i % every === 0 ? p.label : ""}</div>)}
      </div>
      {goals.some(Boolean) ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block w-5 border-t-2 border-dashed border-[var(--hkr-ink-2,#4b5a7c)]" /> {goalLabel}
          <span className="ml-3 inline-block size-2.5 rounded-sm bg-[var(--viz-1)]" /> Revenue
        </div>
      ) : null}
    </div>
  );
}

export function Progress({ value, goal, format = compactUsd }: { value: number; goal: number | null; format?: (n: number) => string }) {
  if (!goal) return <span className="text-xs text-muted-foreground">No goal set</span>;
  const pct = Math.round((value / goal) * 100);
  return (
    <div className="grid gap-1">
      <div className="h-2 rounded-full bg-[var(--viz-track)]">
        <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}% of {format(goal)}</span>
    </div>
  );
}
