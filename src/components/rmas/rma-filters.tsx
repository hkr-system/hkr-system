"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { RMA_STATUSES, RMA_STATUS_LABEL } from "@/lib/rmas/constants";

export function RmaFilters({ accounts }: { accounts: { id: string; code: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v); else next.delete(k);
    start(() => router.push(`${pathname}?${next.toString()}`));
  };
  const v = (k: string) => params.get(k) ?? "";
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-4" aria-busy={pending}>
      <NativeSelect value={v("status") || "open"} onChange={(e) => set("status", e.target.value === "open" ? "" : e.target.value)} aria-label="Status" data-testid="rma-status-filter">
        <option value="open">Open RMAs</option>
        <option value="all">All RMAs</option>
        {RMA_STATUSES.map((s) => <option key={s} value={s}>{RMA_STATUS_LABEL.en[s]}</option>)}
      </NativeSelect>
      <NativeSelect value={v("account")} onChange={(e) => set("account", e.target.value)} aria-label="Account">
        <option value="">All accounts</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
      </NativeSelect>
      <NativeSelect value={v("channel")} onChange={(e) => set("channel", e.target.value)} aria-label="Channel">
        <option value="">Any channel</option>
        <option value="portal">Client portal</option>
        <option value="internal">Typed by the team</option>
        <option value="import">Imported xlsx form</option>
      </NativeSelect>
      <form onSubmit={(e) => { e.preventDefault(); set("q", q.replace(/\s/g, "")); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an IMEI or RMA number" aria-label="Search" data-testid="rma-search" />
      </form>
    </div>
  );
}
