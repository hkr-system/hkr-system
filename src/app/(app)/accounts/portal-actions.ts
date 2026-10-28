"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";
import { supabaseEnv } from "@/lib/supabase/env";

// Client portal logins: created ONLY here, by admin or an account specialist (Gabriel, Oct 27 2026).
// The secret-key client is used for the Auth admin calls only, after the RLS check below.
export type PortalState = { ok?: boolean; error?: string; message?: string; link?: string };
const WHO = ["admin", "account_specialist"] as const;

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

async function canManage(accountId: string) {
  const db = await createClient();
  const { data } = await db.rpc("can_manage_portal", { p_account: accountId });
  return { db, ok: Boolean(data) };
}

export async function invitePortalUser(accountId: string, contactId: string, language: "en" | "es"): Promise<PortalState> {
  await requireRole(WHO);
  const { db, ok } = await canManage(accountId);
  if (!ok) return { error: "You cannot manage the portal of this account." };
  if (!adminClientAvailable()) return { error: "SUPABASE_SECRET_KEY is not set: portal logins cannot be created." };
  const { data: contact } = await db.from("contacts").select("name, email").eq("id", contactId).eq("account_id", accountId).maybeSingle();
  const email = contact?.email?.trim().toLowerCase();
  if (!contact || !email) return { error: "This contact has no email. Add it in Contacts first." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("user_id, role").eq("email", email).maybeSingle();
  if (existing?.role) return { error: "This email belongs to an HKR team member; it cannot be a client login." };
  let userId = existing?.user_id ?? null;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: contact.name } });
    if (error || !data.user) return { error: error?.message ?? "Could not create the login." };
    userId = data.user.id;
  }
  const { data: other } = await admin.from("portal_users").select("account_id").eq("user_id", userId).maybeSingle();
  if (other && other.account_id !== accountId) return { error: "This email already has portal access for another account." };
  if (other) return { error: "This contact already has portal access." };
  const { error } = await db.from("portal_users").insert({ user_id: userId, account_id: accountId, contact_id: contactId, email, language });
  if (error) return { error: error.message };
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true, message: `Portal access created for ${email}. Send the sign-in link (email or copy it to WhatsApp).` };
}

export async function setPortalUserActive(portalUserId: string, active: boolean): Promise<PortalState> {
  await requireRole(WHO);
  const db = await createClient();
  const { data, error } = await db.from("portal_users").update({ active }).eq("id", portalUserId).select("user_id, account_id").single();
  if (error) return { error: error.message };
  if (adminClientAvailable()) {
    // a disabled client is also signed out everywhere (ban); re-enabling lifts it
    await createAdminClient().auth.admin.updateUserById(data.user_id, { ban_duration: active ? "none" : "876000h" });
  }
  revalidatePath(`/accounts/${data.account_id}`);
  return { ok: true, message: active ? "Access enabled." : "Access disabled: the client is signed out and sees nothing." };
}

// One-time sign-in link (valid 1 hour) to paste in WhatsApp — works before email (SMTP) is set up.
export async function portalLoginLink(portalUserId: string): Promise<PortalState> {
  await requireRole(WHO);
  const db = await createClient();
  const { data: pu } = await db.from("portal_users").select("email, active, account_id").eq("id", portalUserId).maybeSingle();
  if (!pu) return { error: "Not found." };
  if (!pu.active) return { error: "Enable the access first." };
  const { ok } = await canManage(pu.account_id);
  if (!ok) return { error: "You cannot manage the portal of this account." };
  if (!adminClientAvailable()) return { error: "SUPABASE_SECRET_KEY is not set." };
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email: pu.email });
  if (error || !data.properties?.hashed_token) return { error: error?.message ?? "Could not create the link." };
  return { ok: true, link: `${await origin()}/portal/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink` };
}

// Sign-in email sent by Supabase Auth (needs the portal email template and SMTP on the hosted project).
export async function sendPortalLinkEmail(portalUserId: string): Promise<PortalState> {
  await requireRole(WHO);
  const db = await createClient();
  const { data: pu } = await db.from("portal_users").select("email, active").eq("id", portalUserId).maybeSingle();
  if (!pu?.active) return { error: "Enable the access first." };
  const { url, key } = supabaseEnv();
  const plain = createPlainClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" } });
  const { error } = await plain.auth.signInWithOtp({ email: pu.email, options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/portal/auth/confirm` } });
  if (error) return { error: error.message };
  return { ok: true, message: `Sign-in email sent to ${pu.email}.` };
}
