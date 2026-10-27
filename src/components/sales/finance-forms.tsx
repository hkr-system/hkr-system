"use client";

import { useActionState } from "react";
import { importHistory, saveMonthPlan, type ActionState } from "@/app/(app)/finance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Math.round(Number(n))));

export function MonthPlanRow({ month, label, actual, history, companyGoal, owners, projection, suggested, suggestedReason, past }: {
  month: string; label: string; actual: number; history: number | null; companyGoal: number | null;
  owners: { id: string; name: string; goal: number | null }[]; projection: number | null; suggested: number | null; suggestedReason: string; past: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveMonthPlan, {});
  const form = `plan-${month}`;
  const used = history ?? actual;
  const pct = companyGoal ? Math.round((used / companyGoal) * 100) : null;
  return (
    <tr className="border-b align-top" data-testid={`plan-${month.slice(0, 7)}`}>
      <td className="py-2 pl-4 pr-2 text-sm font-medium whitespace-nowrap">
        {label}
        <form id={form} action={action}><input type="hidden" name="month" value={month} /><input type="hidden" name="suggested" value={fmt(suggested)} /></form>
      </td>
      <td className="px-2 py-2 text-right text-sm tabular-nums">{actual ? `$${Math.round(actual).toLocaleString("en-US")}` : "—"}</td>
      <td className="px-2 py-2"><Input form={form} name="history" defaultValue={fmt(history)} placeholder={past ? "from your records" : ""} className="h-8 w-28 text-right" aria-label={`History ${label}`} /></td>
      <td className="px-2 py-2"><Input form={form} name="goal_company" defaultValue={fmt(companyGoal)} className="h-8 w-28 text-right" aria-label={`Company goal ${label}`} /></td>
      {owners.map((o) => (
        <td key={o.id} className="px-2 py-2"><Input form={form} name={`goal_${o.id}`} defaultValue={fmt(o.goal)} className="h-8 w-24 text-right" aria-label={`Goal ${o.name} ${label}`} /></td>
      ))}
      <td className="px-2 py-2 text-right text-xs text-muted-foreground tabular-nums" title={suggestedReason}>{suggested !== null ? `$${suggested.toLocaleString("en-US")}` : "—"}</td>
      <td className="px-2 py-2"><Input form={form} name="projection" defaultValue={fmt(projection)} placeholder={suggested !== null ? String(suggested) : ""} className="h-8 w-28 text-right" aria-label={`Projection ${label}`} /></td>
      <td className="px-2 py-2 text-right text-xs tabular-nums">{pct !== null && used ? <span className={pct >= 100 ? "text-emerald-700" : "text-muted-foreground"}>{pct}%</span> : "—"}</td>
      <td className="px-2 py-2 pr-4">
        <Button form={form} type="submit" size="xs" variant="outline" disabled={pending}>Save</Button>
        {state.error ? <span className="block text-xs text-destructive" role="alert">{state.error}</span> : null}
        {state.ok ? <span className="block text-xs text-emerald-700">Saved</span> : null}
      </td>
    </tr>
  );
}

export function HistoryImport() {
  const [state, action, pending] = useActionState<ActionState, FormData>(importHistory, {});
  return (
    <form action={action} className="grid gap-2" data-testid="history-import">
      <Textarea name="text" rows={6} placeholder={"2025-01  245000\n2025-02  198500\n03/2025; 310,000"} className="font-mono text-xs" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Save history</Button>
        {state.error ? <span className="text-xs text-destructive" role="alert">{state.error}</span> : null}
        {state.message ? <span className="text-xs text-emerald-700">{state.message}</span> : null}
      </div>
    </form>
  );
}
