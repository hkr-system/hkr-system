"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { ACCOUNT_STATUS_LABEL } from "@/lib/orders/constants";

export function AccountFilters({ owners, showOwner }: { owners: { user_id: string; full_name: string }[]; showOwner: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v); else next.delete(k);
    start(() => router.push(`/accounts?${next.toString()}`));
  };
  const v = (k: string) => params.get(k) ?? "";
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-4" aria-busy={pending}>
      <Input placeholder="Search code or name…" defaultValue={v("q")} aria-label="Search"
        onKeyDown={(e) => { if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value.trim()); }}
        onBlur={(e) => { if (e.target.value.trim() !== v("q")) set("q", e.target.value.trim()); }} />
      <NativeSelect value={v("market")} onChange={(e) => set("market", e.target.value)} aria-label="Market">
        <option value="">All markets</option>
        {["EU", "LATAM", "US", "ROW"].map((m) => <option key={m}>{m}</option>)}
      </NativeSelect>
      <NativeSelect value={v("status")} onChange={(e) => set("status", e.target.value)} aria-label="Status">
        <option value="">All statuses</option>
        {Object.entries(ACCOUNT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </NativeSelect>
      {showOwner ? (
        <NativeSelect value={v("owner")} onChange={(e) => set("owner", e.target.value)} aria-label="Owner">
          <option value="">All owners</option>
          <option value="none">No owner</option>
          {owners.map((o) => <option key={o.user_id} value={o.user_id}>{o.full_name}</option>)}
        </NativeSelect>
      ) : null}
    </div>
  );
}
