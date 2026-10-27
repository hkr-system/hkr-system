"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";

export function InboxFilters({ numbers }: { numbers: { id: string; label: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/whatsapp?${next.toString()}`);
  }
  return (
    <div className="grid gap-2 border-b p-2">
      <Input placeholder="Search name, phone, company" defaultValue={params.get("q") ?? ""} className="h-8"
        onKeyDown={(e) => { if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value.trim()); }} aria-label="Search" />
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect value={params.get("view") ?? ""} onChange={(e) => set("view", e.target.value)} aria-label="View">
          <option value="">Open</option>
          <option value="unanswered">Unanswered</option>
          <option value="mine">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </NativeSelect>
        <NativeSelect value={params.get("number") ?? ""} onChange={(e) => set("number", e.target.value)} aria-label="Number">
          <option value="">All numbers</option>
          {numbers.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </NativeSelect>
      </div>
    </div>
  );
}
