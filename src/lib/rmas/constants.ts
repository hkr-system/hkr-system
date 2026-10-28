// RMA vocabulary (SOP P6/P10/P11 + the templates of Oct 27 2026). Pure module: client and server.
// English labels for the internal app; `es` labels are for the client portal in Spanish.
import type { Database } from "@/types/database";

type E = Database["public"]["Enums"];
export type RmaStatus = E["rma_status"];
export type RmaUnitStatus = E["rma_unit_status"];
export type RmaResolution = E["rma_resolution"];
export type RmaSource = E["rma_source"];
export type UnitsLocation = E["units_location"];
export type BatchStatus = E["rma_batch_status"];
export type CreditNoteStatus = E["credit_note_status"];
export type CreditAppliedTo = E["credit_applied_to"];
export type Lang = "en" | "es";

export const FAULT_CATEGORIES = [
  "No power / dead", "Battery / charging", "Screen / touch", "Display (lines / spots / backlight)",
  "Camera", "Face ID / Touch ID", "Audio / microphone / speaker", "SIM / network / signal",
  "Wi-Fi / Bluetooth", "Buttons / vibration", "Cosmetic / grading", "Other",
] as const;
export const FAULT_ES: Record<(typeof FAULT_CATEGORIES)[number], string> = {
  "No power / dead": "No enciende",
  "Battery / charging": "Batería / carga",
  "Screen / touch": "Pantalla / táctil",
  "Display (lines / spots / backlight)": "Display (líneas / manchas / luz)",
  Camera: "Cámara",
  "Face ID / Touch ID": "Face ID / Touch ID",
  "Audio / microphone / speaker": "Audio / micrófono / altavoz",
  "SIM / network / signal": "SIM / red / señal",
  "Wi-Fi / Bluetooth": "Wi-Fi / Bluetooth",
  "Buttons / vibration": "Botones / vibración",
  "Cosmetic / grading": "Estética / grado",
  Other: "Otro",
};

export const RMA_STATUSES: readonly RmaStatus[] = [
  "requested", "form_received", "verified", "approved", "awaiting_return", "credit_agreed", "in_batch", "received_hk", "closed",
];
export const RMA_STATUS_LABEL: Record<Lang, Record<RmaStatus, string>> = {
  en: {
    requested: "Requested", form_received: "Form received", verified: "Verified", approved: "Approved",
    awaiting_return: "Awaiting return", credit_agreed: "Credit agreed", in_batch: "In batch",
    received_hk: "Received HK", closed: "Closed",
  },
  es: {
    requested: "Solicitado (faltan datos)", form_received: "Formulario recibido", verified: "Verificado",
    approved: "Aprobado", awaiting_return: "Esperando devolución", credit_agreed: "Crédito acordado",
    in_batch: "En envío a HK", received_hk: "Recibido en HK", closed: "Cerrado",
  },
};
export const RMA_STATUS_STYLE: Record<RmaStatus, string> = {
  requested: "bg-slate-100 text-slate-700",
  form_received: "bg-sky-100 text-sky-800",
  verified: "bg-indigo-100 text-indigo-800",
  approved: "bg-violet-100 text-violet-800",
  awaiting_return: "bg-amber-100 text-amber-800",
  credit_agreed: "bg-teal-100 text-teal-800",
  in_batch: "bg-orange-100 text-orange-800",
  received_hk: "bg-emerald-100 text-emerald-800",
  closed: "bg-zinc-200 text-zinc-600",
};

// The clear next action on every RMA (SOP P6, P10, P11).
export const RMA_NEXT_ACTION: Record<RmaStatus, string> = {
  requested: "Ask the client for what is missing (form, IMEIs or evidence per unit). It is not refused and not processed yet.",
  form_received: "Check every line and the evidence, run the IMEI check (OURS / NOT FOUND), propose a resolution per unit, then mark Verified.",
  verified: "Admin (Sales Director): decide the resolution and the credit per unit, then Approve. Watch the 1 % cap.",
  approved: "Return to HK units: wait for the client to send them (EU: Friday batch of the intermediary). Credits: prepare the credit note.",
  awaiting_return: "Wait for the units; EU clients go in the Friday batch of their intermediary.",
  credit_agreed: "Credit note issued: mark it Applied on the next invoice; close when every unit is settled.",
  in_batch: "The units travel in the weekly batch; mark Received HK when Hong Kong confirms.",
  received_hk: "Hong Kong repairs / replaces; record the result and close.",
  closed: "Nothing to do.",
};

export const RMA_STATUS_HELP_ES: Record<RmaStatus, string> = {
  requested: "Nos faltan datos o evidencias de alguna unidad. Complétalas para que podamos revisarlo.",
  form_received: "Recibimos tu solicitud. Estamos verificando los IMEI y las evidencias.",
  verified: "Verificado. El caso está con el Sales Director para su decisión.",
  approved: "Aprobado. Te indicaremos cómo enviar las unidades o el crédito acordado.",
  awaiting_return: "Esperamos las unidades. No las envíes antes de recibir nuestras instrucciones.",
  credit_agreed: "Crédito acordado: se aplica en tu próxima factura.",
  in_batch: "Tus unidades viajan a Hong Kong en el envío consolidado.",
  received_hk: "Recibidas en Hong Kong; en reparación o reemplazo.",
  closed: "Caso cerrado.",
};
export const RMA_STATUS_HELP_EN: Record<RmaStatus, string> = {
  requested: "Some data or evidence is missing for a unit. Complete it so we can review the case.",
  form_received: "We received your request and are checking the IMEIs and the evidence.",
  verified: "Verified. The case is with the Sales Director for a decision.",
  approved: "Approved. We will tell you how to ship the units or the agreed credit.",
  awaiting_return: "We are waiting for the units. Do not ship anything before our instructions.",
  credit_agreed: "Credit agreed: it is applied on your next invoice.",
  in_batch: "Your units travel to Hong Kong in the consolidated shipment.",
  received_hk: "Received in Hong Kong; being repaired or replaced.",
  closed: "Case closed.",
};

export const RESOLUTIONS: readonly RmaResolution[] = ["pending", "return_hk", "repair_credit", "credit_note", "replacement", "not_covered"];
export const RESOLUTION_LABEL: Record<Lang, Record<RmaResolution, string>> = {
  en: {
    pending: "Pending", return_hk: "Return to HK", repair_credit: "Repair credit (local)", credit_note: "Credit note",
    replacement: "Replacement (next order)", not_covered: "Not covered",
  },
  es: {
    pending: "Pendiente", return_hk: "Devolución a HK", repair_credit: "Crédito de reparación", credit_note: "Nota de crédito",
    replacement: "Reemplazo (próxima orden)", not_covered: "No cubierto",
  },
};
export const CREDIT_RESOLUTIONS: readonly RmaResolution[] = ["repair_credit", "credit_note"];

export const UNIT_STATUSES: readonly RmaUnitStatus[] = [
  "reported", "verified", "awaiting_shipment", "shipped_to_hk", "received_hk", "returned_to_client", "credited", "rejected", "closed",
];
export const UNIT_STATUS_LABEL: Record<Lang, Record<RmaUnitStatus, string>> = {
  en: {
    reported: "Reported", verified: "Verified", awaiting_shipment: "Awaiting shipment", shipped_to_hk: "Shipped to HK",
    received_hk: "Received in HK", returned_to_client: "Returned to client", credited: "Credited", rejected: "Rejected", closed: "Closed",
  },
  es: {
    reported: "Reportada", verified: "Verificada", awaiting_shipment: "Por enviar", shipped_to_hk: "Enviada a HK",
    received_hk: "Recibida en HK", returned_to_client: "Devuelta al cliente", credited: "Acreditada", rejected: "Rechazada", closed: "Cerrada",
  },
};

export const SOURCE_LABEL: Record<Lang, Record<RmaSource, string>> = {
  en: { testing: "Reception testing", end_customer: "End customer" },
  es: { testing: "Prueba al recibir", end_customer: "Cliente final" },
};
export const LOCATION_LABEL: Record<Lang, Record<UnitsLocation, string>> = {
  en: { with_client: "With the client", at_intermediary: "At the EU intermediary", at_end_customer: "At the end customer" },
  es: { with_client: "Con el cliente", at_intermediary: "Con el intermediario en la UE", at_end_customer: "Con el cliente final" },
};

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = { open: "Open (collecting)", shipped: "Shipped to HK", received: "Received in HK" };

export const CN_STATUS_LABEL: Record<Lang, Record<CreditNoteStatus, string>> = {
  en: { draft: "Draft", approved: "Approved", issued: "Issued", applied: "Applied", cancelled: "Cancelled" },
  es: { draft: "Borrador", approved: "Aprobada", issued: "Emitida", applied: "Aplicada", cancelled: "Anulada" },
};
export const CN_STATUS_STYLE: Record<CreditNoteStatus, string> = {
  draft: "bg-slate-100 text-slate-700", approved: "bg-violet-100 text-violet-800", issued: "bg-sky-100 text-sky-800",
  applied: "bg-emerald-100 text-emerald-800", cancelled: "bg-zinc-200 text-zinc-600",
};
export const APPLIED_TO_LABEL: Record<Lang, Record<CreditAppliedTo, string>> = {
  en: { next_invoice: "Next invoice", order_balance: "Balance of an order", refund: "Refund" },
  es: { next_invoice: "Próxima factura", order_balance: "Saldo de una orden", refund: "Reembolso" },
};

// Folder of an RMA in the account-files bucket: <account_id>/rmas/RMA-NN/
export function rmaFolder(rmaNumber: string) {
  return `RMA-${rmaNumber.split("-RMA-")[1] ?? "00"}`;
}
