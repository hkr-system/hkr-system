"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "@/lib/orders/constants";

export function OrderFilters({ accounts }: { accounts: { id: string; code: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v); else next.delete(k);
    start(() => router.push(`/orders?${next.toString()}`));
  };
  const v = (k: string) => params.get(k) ?? "";
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-4" aria-busy={pending}>
      <NativeSelect value={v("status") || "open"} onChange={(e) => set("status", e.target.value === "open" ? "" : e.target.value)} aria-label="Status">
        <option value="open">Open orders</option>
        <option value="all">All orders</option>
        {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
      </NativeSelect>
      <NativeSelect value={v("account")} onChange={(e) => set("account", e.target.value)} aria-label="Account">
        <option value="">All accounts</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
      </NativeSelect>
      <NativeSelect value={v("market")} onChange={(e) => set("market", e.target.value)} aria-label="Market">
        <option value="">All markets</option>
        {["EU", "LATAM", "US", "ROW"].map((m) => <option key={m}>{m}</option>)}
      </NativeSelect>
      <NativeSelect value={v("attention")} onChange={(e) => set("attention", e.target.value)} aria-label="Needs attention">
        <option value="">Any</option>
        <option value="confirm">Payment to confirm</option>
        <option value="deposit">Deposit due</option>
        <option value="balance">Ready, balance due</option>
        <option value="eta">ETA pending</option>
        <option value="ship">Balance paid, not shipped</option>
      </NativeSelect>
    </div>
  );
}
