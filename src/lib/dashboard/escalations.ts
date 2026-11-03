// Escalations to the Sales Director (SOP P8 and §3.5). Pure and unit-tested.

export const TOPICS = [
  ["price", "A price"], ["discount", "A discount"], ["credit", "A credit"], ["date", "A date Hong Kong has not given"],
  ["vat_legal", "VAT or legal advice"], ["refurbishment", "How refurbishment or the SIM conversion is done"],
  ["carrier", "Carrier compatibility"], ["costs", "Anything about our costs"],
  ["other_clients", "Other clients, the team or our suppliers"], ["other", "Something else for the SD"],
] as const;
export type Topic = (typeof TOPICS)[number][0];
export const TOPIC_LABEL = Object.fromEntries(TOPICS) as Record<Topic, string>;

/** SOP P8 step 1 — shown next to the queue as a reminder. */
export const DECIDE_RULE = {
  answer: "Answer alone: product or process questions covered by the training modules and chapter 1, or the order status from the tracker and Hong Kong.",
  escalate: "Prepare for the SD: a price, a discount, a credit, a date Hong Kong has not given, VAT or legal advice, how refurbishment or the SIM conversion is done, carrier compatibility, anything about our costs — and any question about other clients, the team or our suppliers.",
  meanwhile: "Meanwhile: acknowledge to the client with the time you will come back, and come back at that time — with or without the final answer. No figure, no promise.",
};

export type EscalationDoc = {
  client: string; order: string | null; invoiceValue: number | null; what_happened: string; evidence: string | null;
  figures: string | null; client_asks: string | null; proposal: string | null; answer_by: string | null;
};

/** One message to the SD in the SOP §3.5 order: Client · Order · Invoice value · What happened · Evidence · Figures ·
 *  What the client asks · What you propose · When the client expects an answer. */
export function escalationText(e: EscalationDoc) {
  const v = (x: string | null | undefined) => (x && x.trim() ? x.trim() : "—");
  return [
    `Client: ${e.client}`,
    `Order: ${v(e.order)}`,
    `Invoice value: ${e.invoiceValue === null ? "—" : `USD ${e.invoiceValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}`,
    `What happened: ${v(e.what_happened)}`,
    `Evidence: ${v(e.evidence)}`,
    `Figures: ${v(e.figures)}`,
    `What the client asks: ${v(e.client_asks)}`,
    `What I propose: ${v(e.proposal)}`,
    `Answer expected by: ${v(e.answer_by)}`,
  ].join("\n");
}
