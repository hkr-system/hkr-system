// Client messages drafted from the status (SOP P5, §3.3): the Thursday 3-line update and the Tuesday/Wednesday
// RMA ask to every client of an EU intermediary. In the account's language (EN/ES — Gabriel, Nov 3 2026).
// Drafts only: the specialist edits before sending. Facts come from the records (status, ETA given by Hong Kong,
// AWB, amounts with their reference); nothing is promised. Pure and unit-tested.
import { dayMonth, usd } from "./dates";
import { rmaStage } from "./report";

export type Lang = "en" | "es";
export type UpdateOrder = {
  number: string; status: string; eta_date: string | null; tracking: string | null; hk_invoice_no: string | null;
  deposit_payable: number; deposit_confirmed: number; balance_confirmed: number; payable_total: number;
  balance_ok: boolean; label_ok: boolean; delivery_setup: string; payment_awaiting: boolean;
};
export type UpdateRma = {
  number: string; account_code: string; status: string; units: number; units_without_evidence: number;
  batch: { cutoff_date: string; status: string } | null;
};

/** Orders the Thursday update covers: from Invoiced until Shipped (delivered and closed are done). */
export const UPDATE_ORDER_STATUSES = ["invoiced", "deposit_paid", "in_preparation", "ready_to_ship", "balance_paid", "shipped"];

const T = {
  en: {
    header: (d: string) => `Weekly update · ${d}`,
    status: "1. Status: ", next: "2. Next: ", need: "3. What we need from you: ", allOk: "3. Everything is in order with your units.",
    invoiced: "invoice sent, waiting for the deposit", deposit_paid: "deposit received", in_preparation: "in production",
    ready_to_ship: "ready to ship", balance_paid: "balance received, preparing the shipment", shipped: "shipped",
    eta: (d: string) => `, ready date ${d} (as given by Hong Kong)`, noEta: ", ready date to be confirmed by Hong Kong",
    nInvoiced: "production starts when the deposit is received",
    nEta: (d: string) => `next news on ${d}, the ready date given by Hong Kong`,
    nNoEta: "we send the ready date the same day Hong Kong gives it",
    nReady: "the shipment is booked once the balance is received",
    nBalancePaid: "we send the AWB the day the goods leave Hong Kong",
    nShipped: (awb: string) => `tracking with AWB ${awb}`,
    nRmaEvidence: "we review the units as soon as the evidence arrives",
    nRmaBatch: (d: string) => `consolidated shipment to Hong Kong after the Friday ${d} cut-off`,
    deposit: (a: string, o: string) => `the deposit of ${a} for ${o}`,
    balance: (a: string, o: string) => `the balance of ${a} for ${o}`,
    label: (o: string) => `the shipping label for ${o}`,
    evidence: (r: string) => `a photo or short video of each unit (fault + IMEI) for ${r}`,
    invoice: (n: string) => ` (invoice ${n})`,
    rma: {
      "awaiting evidence": "waiting for your evidence", "with SD": "under review", "awaiting return": "approved, waiting for the units",
      "return in transit": "units on the way to Hong Kong", "received HK": "units received in Hong Kong", "credit pending": "credit agreed, credit note in preparation",
    } as Record<string, string>,
  },
  es: {
    header: (d: string) => `Actualización semanal · ${d}`,
    status: "1. Estado: ", next: "2. Próximo paso: ", need: "3. Lo que necesitamos de ustedes: ", allOk: "3. Todo está en orden con sus unidades.",
    invoiced: "factura enviada, pendiente del depósito", deposit_paid: "depósito recibido", in_preparation: "en producción",
    ready_to_ship: "lista para enviar", balance_paid: "saldo recibido, preparando el envío", shipped: "enviada",
    eta: (d: string) => `, fecha de lista ${d} (según Hong Kong)`, noEta: ", fecha de lista por confirmar por Hong Kong",
    nInvoiced: "la producción empieza al recibir el depósito",
    nEta: (d: string) => `próxima novedad el ${d}, fecha de lista dada por Hong Kong`,
    nNoEta: "enviamos la fecha de lista el mismo día que Hong Kong la confirme",
    nReady: "el envío se reserva al recibir el saldo",
    nBalancePaid: "enviamos el AWB el día que la mercancía salga de Hong Kong",
    nShipped: (awb: string) => `seguimiento con el AWB ${awb}`,
    nRmaEvidence: "revisamos las unidades en cuanto llegue la evidencia",
    nRmaBatch: (d: string) => `envío consolidado a Hong Kong después del corte del viernes ${d}`,
    deposit: (a: string, o: string) => `el depósito de ${a} de la ${o}`,
    balance: (a: string, o: string) => `el saldo de ${a} de la ${o}`,
    label: (o: string) => `la etiqueta de envío de la ${o}`,
    evidence: (r: string) => `una foto o video corto de cada unidad (falla + IMEI) del ${r}`,
    invoice: (n: string) => ` (factura ${n})`,
    rma: {
      "awaiting evidence": "esperando su evidencia", "with SD": "en revisión", "awaiting return": "aprobado, esperando las unidades",
      "return in transit": "unidades en camino a Hong Kong", "received HK": "unidades recibidas en Hong Kong", "credit pending": "crédito acordado, nota de crédito en preparación",
    } as Record<string, string>,
  },
} as const;

const shortRma = (r: UpdateRma) => (r.number.startsWith(`${r.account_code}-`) ? r.number.slice(r.account_code.length + 1) : r.number);
const money = (n: number) => usd(Math.round(n * 100) / 100);

export function thursdayDraft(input: { lang: Lang; today: string; orders: UpdateOrder[]; rmas: UpdateRma[] }): string {
  const t = T[input.lang];
  const d = (x: string) => dayMonth(x, input.lang);
  const orders = [...input.orders].filter((o) => UPDATE_ORDER_STATUSES.includes(o.status))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const rmas = input.rmas.filter((r) => r.status !== "closed");

  const status: string[] = []; const next: string[] = []; const need: string[] = [];
  for (const o of orders) {
    const word = (t as unknown as Record<string, string>)[o.status];
    const etaPart = ["deposit_paid", "in_preparation"].includes(o.status) ? (o.eta_date ? t.eta(d(o.eta_date)) : t.noEta) : "";
    const awb = o.status === "shipped" && o.tracking ? `, AWB ${o.tracking}` : "";
    status.push(`${o.number} ${word}${etaPart}${awb}`);

    const n = o.status === "invoiced" ? t.nInvoiced
      : ["deposit_paid", "in_preparation"].includes(o.status) ? (o.eta_date && o.eta_date >= input.today ? t.nEta(d(o.eta_date)) : t.nNoEta)
      : o.status === "ready_to_ship" ? (o.balance_ok ? t.nBalancePaid : t.nReady)
      : o.status === "balance_paid" ? t.nBalancePaid
      : o.status === "shipped" && o.tracking ? t.nShipped(o.tracking) : null;
    if (n) next.push(`${o.number} — ${n}`);

    const inv = o.hk_invoice_no ? t.invoice(o.hk_invoice_no) : "";
    if (o.payment_awaiting) continue; // a payment proof is with us: nothing to ask
    if (o.status === "invoiced" && o.deposit_payable > 0 && o.deposit_confirmed <= 0) need.push(t.deposit(money(o.deposit_payable), o.number) + inv);
    if (o.status === "ready_to_ship" && !o.balance_ok) {
      const due = Math.max(0, o.payable_total - o.deposit_confirmed - o.balance_confirmed);
      need.push(t.balance(money(due), o.number) + inv);
    }
    if (o.status === "balance_paid" && o.delivery_setup === "client_label" && !o.label_ok) need.push(t.label(o.number));
  }
  for (const r of rmas) {
    const stage = rmaStage(r);
    status.push(`${shortRma(r)} (${r.units} pcs) ${t.rma[stage] ?? stage}`);
    if (stage === "awaiting evidence") { next.push(`${shortRma(r)} — ${t.nRmaEvidence}`); need.push(t.evidence(shortRma(r))); }
    else if (r.batch && r.batch.status === "open") next.push(`${shortRma(r)} — ${t.nRmaBatch(d(r.batch.cutoff_date))}`);
  }

  const lines = [t.header(d(input.today)), t.status + status.join("; ") + "."];
  if (next.length) lines.push(t.next + next.join("; ") + ".");
  else lines.push(t.next + (input.lang === "es" ? "sin novedades pendientes de Hong Kong esta semana." : "no pending news from Hong Kong this week."));
  lines.push(need.length ? t.need + need.join("; ") + "." : t.allOk);
  return lines.join("\n");
}

/** Tuesday/Wednesday message to every client of an EU intermediary (SOP P11 "collect during the week"). */
export function rmaAskDraft(input: { lang: Lang; intermediary: string; cutoffDate: string; cutoffTime?: string }): string {
  const time = input.cutoffTime ?? "12:00";
  if (input.lang === "es") {
    return [
      `Hola, el envío de RMAs de esta semana a través de ${input.intermediary} cierra el viernes ${dayMonth(input.cutoffDate, "es")} a las ${time} (hora de Ámsterdam).`,
      "¿Tienen unidades para devolver esta semana? Si es así, envíen el IMEI, modelo y falla de cada unidad con una foto o video corto que muestre la falla y el IMEI (portal o formulario RMA).",
      "No envíen ninguna unidad antes de que confirmemos el RMA. Las unidades con batería hinchada no pueden viajar por avión.",
    ].join("\n");
  }
  return [
    `Hello, this week's RMA shipment through ${input.intermediary} closes on Friday ${dayMonth(input.cutoffDate, "en")} at ${time} (Amsterdam time).`,
    "Do you have units to return this week? If so, please send each unit's IMEI, model and fault with a photo or short video showing the fault and the IMEI (portal or RMA form).",
    "Please do not send any unit before we confirm the RMA. Units with a swollen battery must not travel by air.",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Queues (pure): who still needs this week's Thursday update / RMA ask. "Sent" = a client_updates row of that kind
// for the account with week_start = this Monday (Hong Kong date).
export type SentUpdate = { id?: string; account_id: string; kind: string; week_start: string; sent_at: string; created_by?: string | null };

export function thursdayQueue<A extends { id: string }, O extends UpdateOrder & { account_id: string }, R extends UpdateRma & { account_id: string }>(
  accounts: A[], orders: O[], rmas: R[], updates: SentUpdate[], week: string,
) {
  return accounts.map((account) => {
    const os = orders.filter((o) => o.account_id === account.id && UPDATE_ORDER_STATUSES.includes(o.status));
    const rs = rmas.filter((r) => r.account_id === account.id && r.status !== "closed");
    const sent = updates.filter((u) => u.account_id === account.id && u.kind === "thursday" && u.week_start === week).at(-1) ?? null;
    return { account, orders: os, rmas: rs, sent };
  }).filter((x) => x.orders.length || x.rmas.length);
}

/** Tuesday/Wednesday RMA ask: every active or onboarding client of each EU intermediary. */
export function rmaAskQueue<A extends { id: string; status: string; intermediary_id: string | null }>(
  intermediaries: { id: string; name: string }[], accounts: A[], updates: SentUpdate[], week: string,
) {
  return intermediaries.map((im) => ({
    intermediary: im,
    clients: accounts.filter((a) => a.intermediary_id === im.id && ["active", "onboarding"].includes(a.status)).map((account) => ({
      account, sent: updates.filter((u) => u.account_id === account.id && u.kind === "rma_ask" && u.week_start === week).at(-1) ?? null,
    })),
  })).filter((g) => g.clients.length);
}
