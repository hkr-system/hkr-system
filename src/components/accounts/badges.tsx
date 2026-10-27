import { cn } from "@/lib/utils";
import { ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_STYLE, ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, type AccountStatus, type OrderStatus } from "@/lib/orders/constants";

const base = "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return <span className={cn(base, ORDER_STATUS_STYLE[status], className)} data-testid="order-status">{ORDER_STATUS_LABEL[status]}</span>;
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <span className={cn(base, ACCOUNT_STATUS_STYLE[status])}>{ACCOUNT_STATUS_LABEL[status]}</span>;
}

export function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", ok ? "text-emerald-700" : "text-muted-foreground")}>
      <span aria-hidden>{ok ? "✓" : "○"}</span>{label}
    </span>
  );
}
