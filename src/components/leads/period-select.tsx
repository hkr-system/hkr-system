"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/native-select";

export function PeriodSelect({ value }: { value: string }) {
  const router = useRouter();
  return (
    <NativeSelect className="w-44" value={value} aria-label="Funnel period" onChange={(e) => router.push(`/leads?period=${e.target.value}`)}>
      <option value="30">Last 30 days</option>
      <option value="90">Last 90 days</option>
      <option value="365">Last 12 months</option>
      <option value="all">All time</option>
    </NativeSelect>
  );
}
