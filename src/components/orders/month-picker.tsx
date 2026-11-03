"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/native-select";

// Month of the closed orders on the orders board (keeps the status filter).
export function MonthPicker({ month, months, status }: { month: string; months: { value: string; label: string }[]; status: string | null }) {
  const router = useRouter();
  return (
    <NativeSelect value={month} className="w-auto" aria-label="Month of closed orders" data-testid="month-picker"
      onChange={(e) => router.push(`/sales/board?${new URLSearchParams({ ...(status ? { status } : {}), month: e.target.value }).toString()}`)}>
      {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </NativeSelect>
  );
}
