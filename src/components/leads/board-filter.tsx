"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/native-select";

export function NativeSelectLink({ value }: { value: "mine" | "all" }) {
  const router = useRouter();
  return (
    <NativeSelect className="w-56" value={value} aria-label="Whose leads"
      onChange={(e) => router.push(e.target.value === "all" ? "/leads/board?owner=all" : "/leads/board")}>
      <option value="mine">Mine and unassigned</option>
      <option value="all">Everyone&apos;s</option>
    </NativeSelect>
  );
}
