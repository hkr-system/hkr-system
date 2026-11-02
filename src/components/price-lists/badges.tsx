import { cn } from "@/lib/utils";
import { LIST_STATUS_LABEL, LIST_STATUS_STYLE, type ListStatus } from "@/lib/price-lists/labels";

const base = "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap";
export function ListStatusBadge({ status }: { status: ListStatus }) {
  return <span className={cn(base, LIST_STATUS_STYLE[status])} data-testid="list-status">{LIST_STATUS_LABEL[status]}</span>;
}
export function DueBadge() {
  return <span className={cn(base, "bg-hkr-red-tint text-hkr-action")}>Refresh due</span>;
}
