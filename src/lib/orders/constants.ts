// Accounts and orders vocabulary (brief §6, SOP §2 and P1–P4). Pure module: safe in client and server code.
import type { Database } from "@/types/database";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type BillingEntity = Database["public"]["Enums"]["billing_entity"];
export type AccountStatus = Database["public"]["Enums"]["account_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type DeliverySetup = Database["public"]["Enums"]["delivery_setup"];
export type PaymentType = Database["public"]["Enums"]["payment_type"];
export type FileKind = Database["public"]["Enums"]["file_kind"];

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "quoted", "invoiced", "deposit_paid", "in_preparation", "ready_to_ship",
  "balance_paid", "shipped", "delivered", "closed",
];
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ORDER_STATUSES.filter((s) => !["shipped", "delivered", "closed"].includes(s));

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  quoted: "Quoted",
  invoiced: "Invoiced",
  deposit_paid: "Deposit paid",
  in_preparation: "In preparation",
  ready_to_ship: "Ready to ship",
  balance_paid: "Balance paid",
  shipped: "Shipped",
  delivered: "Delivered",
  closed: "Closed",
};

// The clear next action shown on every order (SOP P2–P4).
export const ORDER_NEXT_ACTION: Record<OrderStatus, string> = {
  quoted: "Send the invoice to the client, then mark Invoiced.",
  invoiced: "Wait for the 10 % deposit; record the proof when it arrives (an admin confirms it).",
  deposit_paid: "Ask Hong Kong for the ready date (ETA), then mark In preparation.",
  in_preparation: "When Hong Kong confirms the goods are ready, mark Ready to ship and ask for the balance.",
  ready_to_ship: "Remind the client to pay the balance; record the proof (an admin confirms it).",
  balance_paid: "Shipping day: load the IMEI file, the label or booking, the AWB, then mark Shipped.",
  shipped: "Check tracking every working day; mark Delivered with the POD.",
  delivered: "Remind the client of the testing window and the RMA form; close when nothing is pending.",
  closed: "Nothing to do.",
};

export const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  quoted: "bg-slate-100 text-slate-700",
  invoiced: "bg-sky-100 text-sky-800",
  deposit_paid: "bg-indigo-100 text-indigo-800",
  in_preparation: "bg-violet-100 text-violet-800",
  ready_to_ship: "bg-amber-100 text-amber-800",
  balance_paid: "bg-orange-100 text-orange-800",
  shipped: "bg-emerald-100 text-emerald-800",
  delivered: "bg-emerald-50 text-emerald-700",
  closed: "bg-zinc-200 text-zinc-600",
};

export function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = ORDER_STATUSES.indexOf(s);
  return i >= 0 && i < ORDER_STATUSES.length - 1 ? ORDER_STATUSES[i + 1] : null;
}

// Statuses that are reached through an admin-confirmed payment, not by a button.
export const PAYMENT_DRIVEN: readonly OrderStatus[] = ["deposit_paid", "balance_paid"];

export const BILLING_ENTITY_LABEL: Record<BillingEntity, string> = {
  ever_state: "Ever State Electronics",
  streamline_fze: "Streamline FZE",
};
export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  onboarding: "Onboarding", active: "Active", paused: "Paused", closed: "Closed",
};
export const ACCOUNT_STATUS_STYLE: Record<AccountStatus, string> = {
  onboarding: "bg-sky-100 text-sky-800", active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800", closed: "bg-zinc-200 text-zinc-600",
};
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { wire: "Wire", usdt: "USDT (TRC-20)" };
export const DELIVERY_SETUP_LABEL: Record<DeliverySetup, string> = {
  client_label: "Client label",
  our_booking: "Our courier booking",
};
export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = { deposit: "Deposit", balance: "Balance", other: "Other" };
export const DIFFERENCE_REASONS = [
  ["none", "No difference"],
  ["bank_charges", "Bank charges"],
  ["fx", "FX"],
  ["short_payment", "Short payment"],
  ["overpayment", "Overpayment"],
  ["missing_usdt_fee", "Missing USDT fee"],
] as const;

// SOP §2.2/§2.3 document types
export const FILE_KINDS: readonly { kind: FileKind; label: string; order: boolean; rma?: boolean }[] = [
  { kind: "INV-HK", label: "Our invoice (INV-HK)", order: true },
  { kind: "INV-EU", label: "Intermediary invoice (INV-EU)", order: true },
  { kind: "PP-DEP", label: "Deposit proof (PP-DEP)", order: true },
  { kind: "PP-BAL", label: "Balance proof (PP-BAL)", order: true },
  { kind: "IMEI", label: "IMEI list", order: true },
  { kind: "LABEL", label: "Client label", order: true },
  { kind: "TRK-HK", label: "Tracking HK (TRK-HK)", order: true },
  { kind: "TRK-EU", label: "Tracking EU (TRK-EU)", order: true },
  { kind: "POD", label: "Proof of delivery (POD)", order: true },
  { kind: "CN", label: "Credit note (CN)", order: true },
  { kind: "OTHER", label: "Other", order: false },
  // RMA folder documents (SOP §2.3: [code]_RMA-NN_FORM · _PRUEBAS · _VERIF · _CN · _TRK)
  { kind: "FORM", label: "RMA request form (FORM)", order: false, rma: true },
  { kind: "PRUEBAS", label: "Evidence photo / video (PRUEBAS)", order: false, rma: true },
  { kind: "VERIF", label: "IMEI check (VERIF, internal)", order: false, rma: true },
  { kind: "TRK", label: "Return tracking (TRK)", order: false, rma: true },
];

export const MONEY = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function money(v: number | string | null | undefined, currency: "USD" | "EUR" = "USD") {
  if (v === null || v === undefined || v === "") return "—";
  return `${currency === "EUR" ? "€" : "US$"} ${MONEY.format(Number(v))}`;
}
