import "server-only";

// Minimal client for the Meta Graph API (WhatsApp Cloud API), called directly.
// Needs WHATSAPP_ACCESS_TOKEN (system-user token) in Vercel. Nothing is sent without it.

export class GraphError extends Error {
  constructor(message: string, public status: number, public code?: number) {
    super(message);
  }
}

export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
}

export function wabaId() {
  return process.env.WHATSAPP_WABA_ID ?? "";
}

async function graph<T>(version: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new GraphError("WhatsApp is not connected yet (WHATSAPP_ACCESS_TOKEN is not set).", 0);
  const res = await fetch(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = data?.error ?? {};
    const detail = e.error_data?.details ? ` — ${e.error_data.details}` : "";
    throw new GraphError(`${e.message ?? res.statusText}${detail}`, res.status, e.code);
  }
  return data as T;
}

type SendResult = { messages?: { id: string }[] };

async function send(version: string, phoneNumberId: string, payload: Record<string, unknown>) {
  const r = await graph<SendResult>(version, `${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
  });
  const id = r.messages?.[0]?.id;
  if (!id) throw new GraphError("Meta did not return a message id.", 500);
  return id;
}

const digits = (phone: string) => phone.replace(/[^0-9]/g, "");

export function sendText(v: string, phoneNumberId: string, to: string, body: string) {
  return send(v, phoneNumberId, { to: digits(to), type: "text", text: { body, preview_url: true } });
}

export type TemplateComponent = { type: string; sub_type?: string; index?: string; parameters: Record<string, unknown>[] };

export function sendTemplate(v: string, phoneNumberId: string, to: string, name: string, language: string, components: TemplateComponent[]) {
  return send(v, phoneNumberId, {
    to: digits(to),
    type: "template",
    template: { name, language: { code: language }, ...(components.length ? { components } : {}) },
  });
}

export function sendMedia(
  v: string, phoneNumberId: string, to: string, kind: "document" | "image" | "video" | "audio",
  mediaId: string, filename?: string, caption?: string,
) {
  const media: Record<string, unknown> = { id: mediaId };
  if (kind === "document" && filename) media.filename = filename;
  if (caption && kind !== "audio") media.caption = caption;
  return send(v, phoneNumberId, { to: digits(to), type: kind, [kind]: media });
}

export async function uploadMedia(v: string, phoneNumberId: string, file: Blob, filename: string) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", file.type || "application/octet-stream");
  form.append("file", file, filename);
  const r = await graph<{ id: string }>(v, `${phoneNumberId}/media`, { method: "POST", body: form });
  return r.id;
}

export async function downloadMedia(v: string, mediaId: string) {
  const meta = await graph<{ url: string; mime_type: string }>(v, mediaId);
  const res = await fetch(meta.url, { headers: { authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }, cache: "no-store" });
  if (!res.ok) throw new GraphError(`Could not download media (${res.status}).`, res.status);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: meta.mime_type };
}

export type MetaTemplate = {
  id: string; name: string; language: string; category: string; status: string; components: unknown[];
};

export async function listTemplates(v: string, waba: string) {
  const out: MetaTemplate[] = [];
  let path = `${waba}/message_templates?fields=id,name,language,category,status,components&limit=100`;
  for (let i = 0; i < 20 && path; i++) {
    const r = await graph<{ data: MetaTemplate[]; paging?: { next?: string } }>(v, path);
    out.push(...r.data);
    path = r.paging?.next ? r.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[0-9.]+\//, "") : "";
  }
  return out;
}

export function numberHealth(v: string, phoneNumberId: string) {
  return graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string; messaging_limit_tier?: string }>(
    v, `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
  );
}

// Meta only sends a WhatsApp account's messages to the webhook of apps "subscribed" to that account.
// POST is idempotent: it (re)subscribes the app that owns the access token.
export function subscribeAppToWaba(v: string, waba: string) {
  return graph<{ success?: boolean }>(v, `${waba}/subscribed_apps`, { method: "POST" });
}

export function listNumbers(v: string, waba: string) {
  return graph<{ data: { id: string; display_phone_number: string; verified_name?: string; quality_rating?: string }[] }>(
    v, `${waba}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
  );
}
