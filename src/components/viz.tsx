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

export function BarList({ rows, empty = "No data" }: { rows: { label: string; value: number; href?: string; hint?: string }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {rows.map((r) => {
        const inner = (
          <div className="grid grid-cols-[minmax(84px,30%)_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${r.value}${r.hint ? ` · ${r.hint}` : ""}`}>
            <span className="truncate text-muted-foreground">{r.label}</span>
            <span className="h-4 rounded-r-[4px] bg-[var(--viz-track)]">
              <span className="block h-full rounded-r-[4px] bg-[var(--viz-1)]" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="w-10 text-right font-medium tabular-nums">{r.value}</span>
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
