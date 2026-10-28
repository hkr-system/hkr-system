import { cn } from "@/lib/utils";
import {
  CN_STATUS_LABEL, CN_STATUS_STYLE, RMA_STATUS_LABEL, RMA_STATUS_STYLE, type CreditNoteStatus, type Lang, type RmaStatus,
} from "@/lib/rmas/constants";

const base = "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function RmaStatusBadge({ status, lang = "en" }: { status: RmaStatus; lang?: Lang }) {
  return <span className={cn(base, RMA_STATUS_STYLE[status])} data-testid="rma-status">{RMA_STATUS_LABEL[lang][status]}</span>;
}

export function CnStatusBadge({ status, lang = "en" }: { status: CreditNoteStatus; lang?: Lang }) {
  return <span className={cn(base, CN_STATUS_STYLE[status])} data-testid="cn-status">{CN_STATUS_LABEL[lang][status]}</span>;
}

// OURS / NOT FOUND (SOP P6 IMEI check). Internally a NOT FOUND can say why (e.g. another account).
export function ImeiCheckBadge({ ours, note }: { ours: boolean; note?: string | null }) {
  return (
    <span className={cn(base, ours ? "bg-emerald-100 text-emerald-800" : "bg-hkr-red-tint text-hkr-action")} title={note ?? undefined} data-testid="imei-check">
      {ours ? "OURS" : "NOT FOUND"}
    </span>
  );
}

export function Flag({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "bad" | "info" }) {
  return (
    <span className={cn(base, tone === "bad" ? "bg-hkr-red-tint text-hkr-action" : tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700")}>
      {children}
    </span>
  );
}
