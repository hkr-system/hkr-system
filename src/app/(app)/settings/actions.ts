"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type SettingState = { ok?: boolean; error?: string };

// Saves one parameter. The value must keep the same kind as before
// (number stays number, list stays list…). RLS also blocks non-admins.
export async function updateSetting(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const key = String(formData.get("key") ?? "");
  const raw = String(formData.get("value") ?? "").trim();

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("settings").select("value").eq("key", key).maybeSingle();
  if (readError || !current) return { error: "Setting not found." };

  let next: NonNullable<Json>;
  const before = current.value;
  if (typeof before === "number") {
    const n = Number(raw.replace(",", "."));
    if (raw === "" || !Number.isFinite(n)) return { error: "Enter a number." };
    next = n;
  } else if (typeof before === "string") {
    if (!raw) return { error: "Value cannot be empty." };
    next = raw;
  } else {
    let parsed: Json;
    try {
      parsed = JSON.parse(raw) as Json;
    } catch {
      return { error: "Not valid JSON. Keep the same shape as before." };
    }
    const sameKind =
      parsed !== null && typeof parsed === "object" && Array.isArray(before) === Array.isArray(parsed);
    if (!sameKind || parsed === null) return { error: "Keep the same shape as before (list or object)." };
    next = parsed;
  }

  const { error } = await supabase.from("settings").update({ value: next }).eq("key", key);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// --- Lead scoring rules (Phase 1) -------------------------------------------

export async function updateScoringRule(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const id = String(formData.get("id"));
  const points = Number(formData.get("points"));
  const active = formData.get("active") === "on";
  const rawValue = String(formData.get("value") ?? "").trim();
  if (!Number.isInteger(points) || points < 0 || points > 100) return { error: "Points must be a whole number 0–100." };
  const supabase = await createClient();
  const { data: rule } = await supabase.from("scoring_rules").select("operator, value").eq("id", id).maybeSingle();
  if (!rule) return { error: "Rule not found." };
  let value: Json = rule.value;
  if (rule.operator !== "in_setting" && rawValue) {
    try {
      value = JSON.parse(rawValue) as Json;
    } catch {
      return { error: "Value is not valid JSON." };
    }
    const ok =
      (rule.operator === "eq" && (typeof value === "boolean" || typeof value === "string" || typeof value === "number")) ||
      (rule.operator === "gte" && typeof value === "number") ||
      (rule.operator === "between" && Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number")) ||
      (rule.operator === "in" && Array.isArray(value));
    if (!ok) return { error: "Keep the same shape as before." };
  }
  const { error } = await supabase.from("scoring_rules").update({ points, active, value }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateTargetCountries(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const { normalizeCountry } = await import("@/lib/leads/countries");
  const parts = String(formData.get("countries") ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const codes: string[] = [];
  for (const p of parts) {
    const c = normalizeCountry(p);
    if (!c) return { error: `Unknown country "${p}". Use names or 2-letter codes (NL, DE, MX…).` };
    if (!codes.includes(c)) codes.push(c);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update({ value: codes }).eq("key", "lead_target_countries");
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateOwnerByMarket(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const value: Record<string, string | null> = {};
  for (const m of ["EU", "LATAM", "US", "ROW"]) {
    const v = String(formData.get(m) ?? "");
    value[m] = /^[0-9a-f-]{36}$/.test(v) ? v : null;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update({ value }).eq("key", "lead_owner_by_market");
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// --- WhatsApp message prices (broadcast cost estimate, Oct 28 2026) ----------
// One row per Meta market: rate_<market>_<category>. Empty = no price for that market/category.
export async function updateMessageRates(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const { META_MARKET_LABELS } = await import("@/lib/whatsapp/pricing");
  const asOf = String(formData.get("as_of") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return { error: "Enter the date the prices were checked." };
  const rates: Record<string, Record<string, number>> = {};
  for (const m of Object.keys(META_MARKET_LABELS)) {
    for (const cat of ["marketing", "utility", "authentication"]) {
      const raw = String(formData.get(`rate_${m}_${cat}`) ?? "").trim().replace(",", ".");
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 5) return { error: `${META_MARKET_LABELS[m]} · ${cat}: enter a price in US$ (e.g. 0.0635).` };
      (rates[m] ??= {})[cat] = n;
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update({ value: { currency: "USD", as_of: asOf, rates } }).eq("key", "wa_message_rates");
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// --- Invoice issuer per billing entity (Oct 30 2026) --------------------------
// Exporter block, signer, phones, bank details, USDT wallet and stamp printed on invoices.
export async function updateInvoiceIssuer(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const entity = String(formData.get("entity") ?? "");
  if (!["ever_state", "streamline_fze"].includes(entity)) return { error: "Unknown billing entity." };
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const lines = (k: string) => text(k).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const supabase = await createClient();
  const { data: current } = await supabase.from("settings").select("value").eq("key", "invoice_issuers").maybeSingle();
  const all = ((current?.value ?? {}) as Record<string, Record<string, unknown>>);
  const before = all[entity] ?? {};
  let stamp = typeof before.stamp === "string" ? before.stamp : undefined;
  const newStamp = text("stamp");
  if (formData.get("remove_stamp") === "on") stamp = undefined;
  else if (newStamp) {
    if (!/^data:image\/(png|jpe?g);base64,/.test(newStamp)) return { error: "The stamp must be a PNG or JPG image." };
    if (newStamp.length > 700_000) return { error: "The stamp image is too large (max ≈ 500 KB)." };
    stamp = newStamp;
  }
  const next = {
    company: text("company"), address: lines("address"), phone: text("phone"), whatsapp: text("whatsapp"),
    signer_name: text("signer_name"), signer_title: text("signer_title"),
    bank_lines: lines("bank_lines"), usdt_lines: lines("usdt_lines"),
    ...(stamp ? { stamp } : {}),
  };
  const { error } = await supabase.from("settings").update({ value: { ...all, [entity]: next } as never }).eq("key", "invoice_issuers");
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// --- SKUs (Oct 30 2026): add real SKUs before real orders ---------------------
// One per line: "model, storage GB, colour[, grade]" — e.g. "iPhone 14 Pro, 256, Deep Purple".
// iPhone 16 series never carries the separate battery line (brief §6), so it is created as not eligible; Samsung neither.
export async function addSkus(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireRole(["admin"]);
  const rows: { model: string; storage_gb: number; color: string; grade: string; battery_eligible: boolean }[] = [];
  const lines = String(formData.get("skus") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Write at least one SKU." };
  for (const [i, line] of lines.entries()) {
    const [model, storage, color, grade] = line.split(/[,;\t]/).map((s) => s.trim());
    const gb = Number((storage ?? "").replace(/gb$/i, "").trim());
    if (!model || !Number.isInteger(gb) || gb <= 0 || !color) {
      return { error: `Line ${i + 1}: use "model, storage GB, colour" (e.g. iPhone 14 Pro, 256, Deep Purple).` };
    }
    rows.push({ model, storage_gb: gb, color, grade: grade || "A+++", battery_eligible: /^iphone/i.test(model) && !/^iphone\s*16\b/i.test(model) }); // Samsung: never
  }
  const supabase = await createClient();
  const { error } = await supabase.from("skus").upsert(rows, { onConflict: "model,storage_gb,color,grade", ignoreDuplicates: true });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function setSkuBatteryEligible(id: string, eligible: boolean): Promise<SettingState> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("skus").update({ battery_eligible: eligible }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// --- Users (Oct 30 2026): role and active flag of each login ------------------
// Logins are created in Supabase → Authentication → Users; here the admin gives them a role.
export async function updateUserAccess(_prev: SettingState, formData: FormData): Promise<SettingState> {
  const me = await requireRole(["admin"]);
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "");
  const active = formData.get("active") === "on";
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 80);
  if (!/^[0-9a-f-]{36}$/.test(userId)) return { error: "Unknown user." };
  if (!["", "admin", "bd", "account_specialist"].includes(role)) return { error: "Unknown role." };
  if (userId === me.id && (role !== "admin" || !active)) return { error: "You cannot remove your own admin access." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName, role: (role || null) as never, active }).eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// --- Intermediaries (Gabriel, Nov 9 2026: "un lugar para agregar todos esos intermediarios… como las direcciones en amazon")
// Companies that invoice the client for us (Global Connect, Galimix, ASR, PGS Megastore…). Admin only (RLS too).
// Fields (Gabriel): company name, VAT / EORI, contact name, contact phone, email, address (+ country, RMA batch day).
// Nov 9 2026: clearance companies (Barry Trading…) live in the same list (kind) — both are invoiced by HKR and pay HKR —
// and the identifiers are separate: RSIN, EORI, KVK/CoC, VAT (empty ones are not printed on the invoice).
export type IntermediaryKind = "intermediary" | "clearance";
export type IntermediaryInput = {
  id?: string; name: string; kind: IntermediaryKind; rsin: string | null; eori: string | null; kvk: string | null; vat: string | null;
  contact: string | null; contact_phone: string | null;
  contact_email: string | null; address: string | null; country: string | null; default_cutoff_weekday: number | null;
};

export async function saveIntermediaries(rows: IntermediaryInput[]): Promise<SettingState & { message?: string }> {
  await requireRole(["admin"]);
  const t = (v: unknown, max: number) => String(v ?? "").trim().replace(/[ \t]+/g, " ").slice(0, max) || null;
  const clean = rows.map((r, i) => {
    const day = Number(r.default_cutoff_weekday);
    return {
      id: r.id && /^[0-9a-f-]{36}$/.test(r.id) ? r.id : undefined, n: i + 1,
      fields: {
        name: t(r.name, 80) ?? "", kind: (r.kind === "clearance" ? "clearance" : "intermediary") as IntermediaryKind,
        rsin: t(r.rsin, 40), eori: t(r.eori, 40), kvk: t(r.kvk, 40), vat: t(r.vat, 40), contact: t(r.contact, 120), contact_phone: t(r.contact_phone, 40),
        contact_email: t(r.contact_email, 160), address: t(r.address, 400), country: t(r.country, 2),
        default_cutoff_weekday: Number.isInteger(day) && day >= 1 && day <= 7 ? day : null,
      },
    };
  });
  for (const r of clean) {
    if (!r.fields.name) return { error: `Company ${r.n}: write the company name.` };
    if (r.fields.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.fields.contact_email)) return { error: `${r.fields.name}: the email does not look right.` };
  }
  const names = clean.map((r) => r.fields.name.toLowerCase());
  const dup = clean.find((r, i) => names.indexOf(names[i]) !== i);
  if (dup) return { error: `"${dup.fields.name}" is twice in the list.` };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("intermediaries").select("id, name");
  for (const r of clean) {
    const other = (existing ?? []).find((e) => e.name.toLowerCase() === r.fields.name.toLowerCase() && e.id !== r.id);
    if (other) return { error: `There is already a company called ${other.name}.` };
  }
  let added = 0;
  for (const r of clean) {
    const { error } = r.id
      ? await supabase.from("intermediaries").update(r.fields).eq("id", r.id)
      : await supabase.from("intermediaries").insert(r.fields);
    if (error) return { error: error.code === "23505" ? `There is already a company called ${r.fields.name}.` : error.message };
    if (!r.id) added++;
  }
  revalidatePath("/settings");
  return { ok: true, message: added ? `Saved (${added} new).` : "Saved." };
}

// Only a company that no order, client or RMA batch uses can be removed (a typo, a test).
export async function deleteIntermediary(id: string): Promise<SettingState> {
  await requireRole(["admin"]);
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "Unknown intermediary." };
  const supabase = await createClient();
  const [o, a, b] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("intermediary_id", id),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("intermediary_id", id),
    supabase.from("rma_batches").select("id", { count: "exact", head: true }).eq("intermediary_id", id),
  ]);
  if ((o.count ?? 0) + (a.count ?? 0) + (b.count ?? 0) > 0) return { error: "It is used by orders, clients or RMA batches: it stays." };
  const { error } = await supabase.from("intermediaries").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
