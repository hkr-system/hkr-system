// Helpers to read Meta template components and fill their {{n}} variables.

export type TplComponent = {
  type: string; // HEADER | BODY | FOOTER | BUTTONS
  format?: string; // TEXT | IMAGE | DOCUMENT | VIDEO (headers)
  text?: string;
  buttons?: { type: string; text: string; url?: string }[];
};

export function components(raw: unknown): TplComponent[] {
  return Array.isArray(raw) ? (raw as TplComponent[]) : [];
}

export function bodyText(raw: unknown) {
  return components(raw).find((c) => c.type === "BODY")?.text ?? "";
}

export function headerFormat(raw: unknown) {
  return components(raw).find((c) => c.type === "HEADER")?.format ?? null;
}

// Number of {{n}} placeholders in the body (positional variables).
export function bodyVariableCount(raw: unknown) {
  const matches = bodyText(raw).match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  return matches.reduce((max, m) => Math.max(max, Number(m.replace(/\D/g, ""))), 0);
}

export function fillBody(raw: unknown, values: string[]) {
  return bodyText(raw).replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => values[Number(n) - 1] ?? `{{${n}}}`);
}

export type VariableSource = { source: "text" | "company" | "first_name" | "contact_name"; value?: string };

export function resolveVariables(vars: VariableSource[], lead: { company?: string | null; contact_name?: string | null }) {
  return vars.map((v) => {
    if (v.source === "company") return lead.company || "there";
    if (v.source === "contact_name") return lead.contact_name || lead.company || "there";
    if (v.source === "first_name") return (lead.contact_name ?? "").trim().split(/\s+/)[0] || lead.company || "there";
    return v.value ?? "";
  });
}

// Builds the "components" array for the send API.
export function buildComponents(raw: unknown, bodyValues: string[], headerMedia?: { id: string; filename?: string }) {
  const out: { type: string; parameters: Record<string, unknown>[] }[] = [];
  const fmt = headerFormat(raw);
  if (headerMedia && fmt && fmt !== "TEXT") {
    const kind = fmt.toLowerCase(); // image | document | video
    const media: Record<string, unknown> = { id: headerMedia.id };
    if (kind === "document" && headerMedia.filename) media.filename = headerMedia.filename;
    out.push({ type: "header", parameters: [{ type: kind, [kind]: media }] });
  }
  if (bodyValues.length) out.push({ type: "body", parameters: bodyValues.map((text) => ({ type: "text", text })) });
  return out;
}

export function costCategory(category: string): "marketing" | "utility" | "authentication" {
  const c = category.toUpperCase();
  return c === "MARKETING" ? "marketing" : c === "AUTHENTICATION" ? "authentication" : "utility";
}

export const WINDOW_MS = 24 * 3600_000;

export function windowOpen(lastInboundAt: string | null | undefined, now = Date.now()) {
  return Boolean(lastInboundAt) && now - new Date(lastInboundAt!).getTime() < WINDOW_MS;
}
