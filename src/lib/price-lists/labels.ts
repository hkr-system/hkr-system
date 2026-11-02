import type { Database } from "@/types/database";

export type ListStatus = Database["public"]["Enums"]["price_list_status"];
export const LIST_STATUS_LABEL: Record<ListStatus, string> = { draft: "Draft", approved: "Approved", superseded: "Superseded" };
export const LIST_STATUS_STYLE: Record<ListStatus, string> = {
  draft: "bg-amber-100 text-amber-900", approved: "bg-emerald-100 text-emerald-900", superseded: "bg-muted text-muted-foreground",
};
export const isDue = (validUntil: string | null, today: string) => Boolean(validUntil && validUntil <= today);
export const pctText = (n: number | string | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n).toFixed(2)} %`);
