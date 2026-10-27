// HKR System — WhatsApp webhook (Supabase Edge Function).
// Meta calls this URL for every message and status of the 4 numbers.
//   GET  → verification handshake (hub.verify_token must equal WHATSAPP_VERIFY_TOKEN)
//   POST → checks X-Hub-Signature-256 with META_APP_SECRET, then stores everything
//          through the database function public.wa_ingest (idempotent).
// Secrets (Supabase → Edge Functions → Secrets): META_APP_SECRET, WHATSAPP_VERIFY_TOKEN.
// "Verify JWT" must be OFF for this function (Meta does not send a Supabase token).
// No imports on purpose: plain fetch to the database API, easy to paste in the dashboard editor.

const encoder = new TextEncoder();

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return keys.default ?? Object.values(keys)[0] ?? "";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
    if (mode === "subscribe" && expected && token === expected) return new Response(challenge, { status: 200 });
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const secret = Deno.env.get("META_APP_SECRET") ?? "";
  const header = req.headers.get("x-hub-signature-256") ?? "";
  if (!secret || !header.startsWith("sha256=") || !safeEqual(header.slice(7), await hmacHex(secret, raw))) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const base = Deno.env.get("SUPABASE_URL")!;
  const key = serviceKey();
  const headers: Record<string, string> = { apikey: key, "content-type": "application/json" };
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`; // legacy JWT key

  const res = await fetch(`${base}/rest/v1/rpc/wa_ingest`, { method: "POST", headers, body: JSON.stringify({ payload }) });
  const text = await res.text();
  const error = res.ok ? null : text.slice(0, 1000);
  // Keep a copy for debugging (admin-only table), with the error if any.
  await fetch(`${base}/rest/v1/wa_webhook_events`, {
    method: "POST",
    headers: { ...headers, prefer: "return=minimal" },
    body: JSON.stringify({ payload, error }),
  });
  if (error) console.error("wa_ingest failed", error);
  // Always 200 once the signature is valid: Meta retries non-200 answers for days.
  return new Response(res.ok ? text : JSON.stringify({ error }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
