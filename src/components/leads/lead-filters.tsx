"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { MARKETS, STAGES, TIERS } from "@/lib/leads/constants";

type Props = {
  team: { user_id: string; full_name: string }[];
  sources: string[];
};

export function LeadFilters({ team, sources }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    start(() => router.push(`/leads/list?${next.toString()}`));
  }

  const v = (k: string) => params.get(k) ?? "";
  const hasFilters = ["q", "stage", "tier", "market", "owner", "source", "due"].some((k) => params.get(k));

  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7" aria-busy={pending}>
      <Input
        placeholder="Search company, contact, email…"
        defaultValue={v("q")}
        className="sm:col-span-3 lg:col-span-2"
        onKeyDown={(e) => { if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value.trim()); }}
        onBlur={(e) => { if (e.target.value.trim() !== v("q")) set("q", e.target.value.trim()); }}
        aria-label="Search"
      />
      <NativeSelect value={v("stage")} onChange={(e) => set("stage", e.target.value)} aria-label="Stage">
        <option value="">All stages</option>
        <option value="open">Open (not Won/Lost)</option>
        {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
      </NativeSelect>
      <NativeSelect value={v("tier")} onChange={(e) => set("tier", e.target.value)} aria-label="Tier">
        <option value="">All tiers</option>
        {TIERS.map((t) => <option key={t} value={t}>Tier {t}</option>)}
        <option value="dq">Disqualified</option>
      </NativeSelect>
      <NativeSelect value={v("market")} onChange={(e) => set("market", e.target.value)} aria-label="Market">
        <option value="">All markets</option>
        {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
      </NativeSelect>
      <NativeSelect value={v("owner")} onChange={(e) => set("owner", e.target.value)} aria-label="Owner">
        <option value="">All owners</option>
        <option value="me">Mine</option>
        <option value="none">No owner</option>
        {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
      </NativeSelect>
      <NativeSelect value={v("source")} onChange={(e) => set("source", e.target.value)} aria-label="Source">
        <option value="">All sources</option>
        {sources.map((s) => <option key={s} value={s}>{s}</option>)}
      </NativeSelect>
      <NativeSelect value={v("due")} onChange={(e) => set("due", e.target.value)} aria-label="Next action due">
        <option value="">Any next action</option>
        <option value="overdue">Overdue</option>
        <option value="today">Due today or earlier</option>
        <option value="week">Due within 7 days</option>
        <option value="none">No next action</option>
      </NativeSelect>
      {hasFilters ? (
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => start(() => router.push("/leads/list"))}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
