"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CODE_RE } from "@/lib/accounts/code";
import { marketForCountry } from "@/lib/leads/countries";
import { normalizePhone } from "@/lib/leads/normalize";
import type { AccountStatus, BillingEntity, DeliverySetup, FileKind, PaymentMethod } from "@/lib/orders/constants";
import { FILE_KINDS } from "@/lib/orders/constants";

export type ActionState = { ok?: boolean; error?: string; message?: string };

const STAFF = ["admin", "bd", "account_specialist"] as const;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;

function friendly(e: { code?: string; message: string }) {
  if (e.code === "23505" && e.message.includes("code")) return "That client code is already used. Codes are never reused (SOP §2.1).";
  if (e.code === "23514" && e.message.includes("code_format")) return "The client code must look like AAA-CC-NNN (e.g. BRC-NL-001).";
  if (e.code === "42501") return e.message.includes("code") ? e.message : "You do not have access to change this.";
  return e.message;
}

function setupFields(fd: FormData) {
  const country = str(fd, "country").toUpperCase() || null;
  const intermediary = opt(fd, "intermediary_id");
  return {
    name: str(fd, "name"),
    legal_name: opt(fd, "legal_name"),
    country,
    market: (str(fd, "market") || marketForCountry(country)) as "EU" | "LATAM" | "US" | "ROW" | null,
    vat_eori: opt(fd, "vat_eori"),
    billing_address: opt(fd, "billing_address"),
    company_ids: opt(fd, "company_ids"),
    billing_entity: (str(fd, "billing_entity") || "ever_state") as BillingEntity,
    intermediary_id: intermediary,
    // SOP §2.4: with an EU intermediary invoice the client pays EUR, otherwise USD
    currency: (intermediary ? "EUR" : "USD") as "EUR" | "USD",
    payment_method: (str(fd, "payment_method") || "wire") as PaymentMethod,
    delivery_setup: (str(fd, "delivery_setup") || "client_label") as DeliverySetup,
    invoice_format: {
      battery_line_separate: fd.get("battery_line_separate") === "on",
      show_ce_text: fd.get("show_ce_text") === "on",
      show_note: fd.get("show_note") === "on",
    },
    language: str(fd, "language") === "es" ? "es" : "en",
    tier: opt(fd, "tier"),
    drive_folder_url: opt(fd, "drive_folder_url"),
    whatsapp_group_note: opt(fd, "whatsapp_group_note"),
    notes: opt(fd, "notes"),
  };
}

async function writeAssignments(db: Awaited<ReturnType<typeof createClient>>, accountId: string, owner: string | null, specialist: string | null) {
  await db.from("account_assignments").delete().eq("account_id", accountId);
  const rows = [
    ...(owner ? [{ account_id: accountId, user_id: owner, role_on_account: "owner" as const }] : []),
    ...(specialist ? [{ account_id: accountId, user_id: specialist, role_on_account: "specialist" as const }] : []),
  ];
  if (rows.length) {
    const { error } = await db.from("account_assignments").insert(rows);
    if (error) return error.message;
  }
  return null;
}

export async function createAccount(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["admin", "account_specialist"]);
  const db = await createClient();
  const code = str(fd, "code").toUpperCase();
  if (!CODE_RE.test(code)) return { error: "The client code must look like AAA-CC-NNN (e.g. BRC-NL-001)." };
  const fields = setupFields(fd);
  if (!fields.name) return { error: "Give the client a name." };
  if (!fields.country) return { error: "Choose the country of the invoiced entity." };
  const { data, error } = await db.from("accounts")
    .insert({ ...fields, code, status: "onboarding" as AccountStatus })
    .select("id").single();
  if (error) return { error: friendly(error) };

  if (user.role === "admin") {
    const problem = await writeAssignments(db, data.id, opt(fd, "owner_user_id"), opt(fd, "specialist_user_id"));
    if (problem) return { error: problem };
  }
  const contactName = str(fd, "contact_name");
  if (contactName) {
    const phone = str(fd, "contact_phone") ? normalizePhone(str(fd, "contact_phone"), fields.country) : null;
    await db.from("contacts").insert({
      account_id: data.id, name: contactName, role: opt(fd, "contact_role"), phone_e164: phone,
      email: opt(fd, "contact_email"), language: fields.language, whatsapp_opt_in: fd.get("contact_opt_in") === "on",
    });
  }
  revalidatePath("/accounts");
  redirect(`/accounts/${data.id}`);
}

export async function updateAccount(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(STAFF);
  const db = await createClient();
  const id = str(fd, "id");
  const fields = setupFields(fd);
  if (!fields.name) return { error: "Give the client a name." };
  const status = (str(fd, "status") || undefined) as AccountStatus | undefined;
  let code: string | undefined;
  if (user.role === "admin" && str(fd, "code")) {
    code = str(fd, "code").toUpperCase();
    if (!CODE_RE.test(code)) return { error: "The client code must look like AAA-CC-NNN (e.g. BRC-NL-001)." };
  }
  const patch = { ...fields, ...(status ? { status } : {}), ...(code ? { code } : {}) };
  const { error, count } = await db.from("accounts").update(patch, { count: "exact" }).eq("id", id);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "You do not have access to this account." };
  if (user.role === "admin") {
    const problem = await writeAssignments(db, id, opt(fd, "owner_user_id"), opt(fd, "specialist_user_id"));
    if (problem) return { error: problem };
  }
  revalidatePath(`/accounts/${id}`);
  revalidatePath("/accounts");
  return { ok: true, message: "Saved." };
}

export async function saveContact(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(STAFF);
  const db = await createClient();
  const id = opt(fd, "id");
  const accountId = str(fd, "account_id");
  const name = str(fd, "name");
  if (!name) return { error: "Give the contact a name." };
  const rawPhone = str(fd, "phone");
  const phone = rawPhone ? normalizePhone(rawPhone, opt(fd, "country")) : null;
  if (rawPhone && !phone) return { error: "That phone number does not look valid. Use the international format, e.g. +31 6 1234 5678." };
  const row = {
    account_id: accountId, name, role: opt(fd, "role"), phone_e164: phone, email: opt(fd, "email"),
    language: str(fd, "language") === "es" ? "es" : "en", whatsapp_opt_in: fd.get("whatsapp_opt_in") === "on",
  };
  const { error } = id
    ? await db.from("contacts").update(row).eq("id", id)
    : await db.from("contacts").insert(row);
  if (error) return { error: error.message };
  // a WhatsApp chat already open with this phone now belongs to the account
  if (phone) await db.from("wa_conversations").update({ account_id: accountId }).eq("contact_phone", phone).is("account_id", null);
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true, message: id ? "Contact saved." : "Contact added." };
}

export async function deleteContact(id: string, accountId: string): Promise<ActionState> {
  await requireRole(STAFF);
  const db = await createClient();
  const { error } = await db.from("contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true };
}

// Called by the upload component after the browser stored the file in the private bucket.
export async function registerFile(input: {
  accountId: string; orderId: string | null; rmaId?: string | null; rmaUnitId?: string | null;
  kind: FileKind; path: string; fileName: string; mime: string; size: number;
}): Promise<ActionState & { id?: string }> {
  const user = await requireRole(STAFF);
  if (!input.path.startsWith(`${input.accountId}/`)) return { error: "Wrong file location." };
  if (!FILE_KINDS.some((k) => k.kind === input.kind)) return { error: "Unknown document type." };
  const db = await createClient();
  const { data, error } = await db.from("files").insert({
    account_id: input.accountId,
    owner_table: input.rmaId ? "rmas" : input.orderId ? "orders" : "accounts",
    owner_id: input.rmaId ?? input.orderId ?? input.accountId,
    rma_unit_id: input.rmaUnitId ?? null,
    kind: input.kind, storage_path: input.path, file_name: input.fileName,
    mime_type: input.mime || null, size_bytes: input.size,
  }).select("id").single();
  if (error) return { error: error.message };
  if (input.orderId && !input.rmaId) {
    await db.from("order_events").insert({
      order_id: input.orderId, account_id: input.accountId, kind: "file", file_id: data.id,
      body: `${input.kind} uploaded: ${input.fileName}`, user_id: user.id,
    });
    revalidatePath(`/orders/${input.orderId}`);
  }
  if (input.rmaId) revalidatePath(`/rmas/${input.rmaId}`);
  revalidatePath(`/accounts/${input.accountId}`);
  return { ok: true, id: data.id };
}
