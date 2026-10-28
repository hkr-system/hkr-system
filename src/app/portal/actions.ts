"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PORTAL_LANG_COOKIE } from "@/lib/portal/session";
import { PORTAL_TEXT, type PortalLang } from "@/lib/portal/texts";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export type LinkState = { sent?: boolean; error?: string };

// Sign-in link by email — ONLY for logins HKR created (shouldCreateUser: false; sign-ups are off).
// The answer is the same whether the email exists or not, so nobody can probe for clients.
export async function requestLoginLink(_p: LinkState, fd: FormData): Promise<LinkState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const lang = (String(fd.get("lang") ?? "en") === "es" ? "es" : "en") as PortalLang;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: lang === "es" ? "Escribe un correo válido." : "Enter a valid email." };
  const db = await createClient();
  const { error } = await db.auth.signInWithOtp({
    email, options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/portal/auth/confirm` },
  });
  if (error && /rate|too many|security purposes/i.test(error.message)) {
    return { error: lang === "es" ? "Demasiados intentos. Espera unos minutos." : "Too many tries. Wait a few minutes." };
  }
  return { sent: true };
}

export async function setPortalLang(lang: PortalLang) {
  (await cookies()).set(PORTAL_LANG_COOKIE, lang === "es" ? "es" : "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/portal", "layout");
}

export async function portalSignOut() {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/portal/login");
}

export type PortalUnit = {
  imei: string; model?: string | null; storage_gb?: number | null; color?: string | null; fault_category: string; fault_text?: string | null;
  source: "testing" | "end_customer"; detected_on?: string | null; battery_swollen: boolean; physical_damage: boolean;
};

export async function checkImei(imei: string) {
  const db = await createClient();
  const { data, error } = await db.rpc("portal_check_imei", { p_imei: imei });
  if (error) return null;
  return data as { valid: boolean; found: boolean; order?: string; model?: string; storage_gb?: number; color?: string; shipped_on?: string;
    warranty_until?: string | null; warranty_ok?: boolean | null; claimed_before?: string | null };
}

export async function createPortalRma(input: {
  units: PortalUnit[]; location: string; orderRefs: string; contactName: string; contactInfo: string; notes: string; lang: PortalLang;
}): Promise<{ error?: string; id?: string; number?: string; units?: { id: string; imei: string }[] }> {
  const t = PORTAL_TEXT[input.lang];
  const seen = new Set<string>();
  for (const u of input.units) {
    if (!/^\d{15}$/.test(u.imei)) return { error: `${u.imei || "—"}: ${t.imeiInvalid}` };
    if (seen.has(u.imei)) return { error: `${u.imei}: DUPLICATE` };
    seen.add(u.imei);
  }
  const db = await createClient();
  const { data, error } = await db.rpc("portal_create_rma", {
    p_units: input.units, p_location: input.location, p_order_refs: input.orderRefs, p_contact_name: input.contactName,
    p_contact_info: input.contactInfo, p_notes: input.notes,
  });
  if (error) return { error: error.message };
  const r = data as { id: string; number: string; units: { id: string; imei: string }[] };
  return { id: r.id, number: r.number, units: r.units };
}

export async function addPortalEvidence(unitId: string, path: string, name: string, mime: string, size: number) {
  const db = await createClient();
  const { error } = await db.rpc("portal_add_evidence", { p_unit: unitId, p_path: path, p_name: name, p_mime: mime, p_size: size });
  return error ? { error: error.message } : { ok: true };
}

export async function submitPortalRma(rmaId: string) {
  const db = await createClient();
  const { data, error } = await db.rpc("portal_submit_rma", { p_rma: rmaId });
  revalidatePath("/portal", "layout");
  if (error) return { error: error.message };
  return data as { ok: boolean; missing_evidence?: string[] };
}
