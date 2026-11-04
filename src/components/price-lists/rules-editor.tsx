"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { EditLock } from "@/components/edit-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { saveRules } from "@/app/(app)/price-lists/actions";

export type Rule = { id: string; model: string; storage_gb: number; increment_usd: number; note: string | null; last_used_at: string | null; in_base: boolean; label: string };
type Draft = { key: string; id?: string; model: string; storage_gb: number; label: string; increment: string; note: string; in_base: boolean; used: string | null };

// Account → Price lists → "Price rules": fixed US$ over the base per model + GB, used every time a list is prepared.
export function RulesEditor({ accountId, rules, choices }: {
  accountId: string; rules: Rule[]; choices: { model: string; storage_gb: number; label: string }[];
}) {
  const router = useRouter();
  const start0 = (): Draft[] => rules.map((r) => ({ key: r.id, id: r.id, model: r.model, storage_gb: r.storage_gb, label: r.label,
    increment: r.increment_usd.toFixed(2), note: r.note ?? "", in_base: r.in_base, used: r.last_used_at }));
  const [rows, setRows] = useState<Draft[]>(start0);
  const sig = rules.map((r) => `${r.id}:${r.increment_usd}:${r.note ?? ""}`).join("|");
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) { setSeen(sig); setRows(start0()); }
  const [deleted, setDeleted] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const free = choices.filter((c) => !rows.some((r) => r.model === c.model && r.storage_gb === c.storage_gb));

  const add = () => {
    const c = free.find((x) => `${x.model}|${x.storage_gb}` === pick);
    if (!c) return;
    setRows((x) => [...x, { key: `new-${pick}`, model: c.model, storage_gb: c.storage_gb, label: c.label, increment: "", note: "", in_base: true, used: null }]);
    setPick("");
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const list = rows.map((r) => ({ id: r.id, model: r.model, storage_gb: r.storage_gb, increment: Number(r.increment.replace(/[$,\s]/g, "")), note: r.note }));
    start(async () => {
      const res = await saveRules(accountId, list, deleted);
      setMsg(res.error ? { text: res.error } : { ok: true, text: res.message ?? "Saved." });
      if (!res.error) setDeleted([]);
      router.refresh();
    });
  };

  return (
    <EditLock label="Edit rules" testId="lock-rules">
      <form onSubmit={save} className="grid gap-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm" data-tabular>
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 text-left font-medium">Model</th>
                <th className="px-2 py-2 text-right font-medium">GB</th>
                <th className="px-2 py-2 text-right font-medium">Over the base (US$)</th>
                <th className="px-2 py-2 text-left font-medium">Note</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0" data-testid="rule-row">
                  <td className="py-1.5 pr-2">{r.label}</td>
                  <td className="px-2 py-1.5 text-right">{r.storage_gb}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Input value={r.increment} inputMode="decimal" aria-label={`Rule ${r.label} ${r.storage_gb}`} data-testid="rule-amount"
                      onChange={(e) => { const v = e.target.value; setRows((x) => x.map((y) => (y.key === r.key ? { ...y, increment: v } : y))); }}
                      className="ml-auto h-7 w-24 text-right tabular-nums" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={r.note} aria-label="Note" onChange={(e) => { const v = e.target.value; setRows((x) => x.map((y) => (y.key === r.key ? { ...y, note: v } : y))); }}
                      className="h-7" />
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {r.in_base ? <span className="text-muted-foreground">{r.used ? "In use" : "New"}</span>
                      : <span className="rounded bg-muted px-1.5 py-0.5">Discontinued — not in the base</span>}
                  </td>
                  <td className="w-10">
                    <Button type="button" size="icon" variant="ghost" aria-label="Delete this rule"
                      onClick={() => { if (r.id) setDeleted((d) => [...d, r.id!]); setRows((x) => x.filter((y) => y.key !== r.key)); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={6} className="py-3 text-muted-foreground">No rules yet: every model follows the engine.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Model for a new rule" data-testid="rule-pick"
            className="w-64">
            <option value="">Add a model…</option>
            {free.map((c) => <option key={`${c.model}|${c.storage_gb}`} value={`${c.model}|${c.storage_gb}`}>{c.label} {c.storage_gb} GB</option>)}
          </NativeSelect>
          <Button type="button" size="sm" variant="outline" onClick={add} disabled={!pick}>Add</Button>
          <Button type="submit" size="sm" disabled={pending} data-testid="save-rules">{pending ? "Saving…" : "Save rules"}</Button>
        </div>
        {msg ? <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{msg.text}</p> : null}
      </form>
    </EditLock>
  );
}
