"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseImeis } from "@/lib/orders/imei";
import { ORDER_STATUSES, type DeliverySetup, type OrderStatus, type PaymentMethod, type PaymentType } from "@/lib/orders/constants";
import { onOrderStatusChange } from "@/lib/whatsapp/automations";

export type ActionState = { ok?: boolean; error?: string; message?: string };

const STAFF = ["admin", "bd", "account_specialist"] as const;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const num = (fd: FormData, k: string) => {
  const v = Number(str(fd, k).replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
};

function friendly(e: { code?: string; message: string }) {
  if (e.code === "42501" && !/admin/i.test(e.message)) return "You do not have access to do this.";
  return e.message;
}

function refresh(orderId?: string, accountId?: string) {
  revalidatePath("/orders");
  if (orderId) revalidatePath(`/orders/${orderId}`);
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

type LineInput = { sku_id: string | null; description: string | null; qty: number; unit_price: number; battery_new: boolean; battery_unit: number; base_price: number | null };

function parseLines(raw: string): { lines: LineInput[]; problem?: string } {
  let data: unknown;
  try { data = JSON.parse(raw || "[]"); } catch { return { lines: [], problem: "The order lines could not be read." }; }
  if (!Array.isArray(data)) return { lines: [], problem: "The order lines could not be read." };
  const lines: LineInput[] = [];
  for (const [i, l] of data.entries()) {
    const qty = Math.round(Number(l.qty));
    const price = Number(l.unit_price);
    if (!l.sku_id && !String(l.description ?? "").trim()) continue; // empty row
    if (!(qty > 0)) return { lines, problem: `Line ${i + 1}: quantity must be more than 0.` };
    if (!(price >= 0)) return { lines, problem: `Line ${i + 1}: unit price is missing.` };
    lines.push({
      sku_id: l.sku_id || null, description: String(l.description ?? "").trim() || null, qty, unit_price: price,
      battery_new: Boolean(l.battery_new), battery_unit: Number(l.battery_unit) || 0,
      base_price: l.base_price === "" || l.base_price === null || l.base_price === undefined ? null : Number(l.base_price),
    });
  }
  if (!lines.length) return { lines, problem: "Add at least one line." };
  return { lines };
}

export async function saveOrder(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(STAFF);
  const db = await createClient();
  const id = opt(fd, "id");
  const { lines, problem } = parseLines(str(fd, "lines"));
  if (problem) return { error: problem };
  const eur = str(fd, "partner_invoice_eur");
  const fields = {
    order_date: str(fd, "order_date") || new Date().toISOString().slice(0, 10),
    payment_method: (str(fd, "payment_method") || "wire") as PaymentMethod,
    delivery_setup: (str(fd, "delivery_setup") || "client_label") as DeliverySetup,
    hk_invoice_no: opt(fd, "hk_invoice_no"),
    partner_invoice_no: opt(fd, "partner_invoice_no"),
    partner_invoice_eur: eur ? num(fd, "partner_invoice_eur") : null,
    freight_usd: num(fd, "freight_usd"),
    customs_usd: num(fd, "customs_usd"),
    rma_discount_usd: num(fd, "rma_discount_usd"),
    eta_date: opt(fd, "eta_date"),
    notes: opt(fd, "notes"),
    ship_to: {
      name: str(fd, "ship_name"), address: str(fd, "ship_address"), city: str(fd, "ship_city"),
      country: str(fd, "ship_country"), contact: str(fd, "ship_contact"), phone: str(fd, "ship_phone"),
    },
  };

  let orderId = id;
  let accountId = str(fd, "account_id");
  if (id) {
    const { data: cur } = await db.from("orders").select("status, account_id").eq("id", id).maybeSingle();
    if (!cur) return { error: "Order not found." };
    if (["shipped", "delivered", "closed"].includes(cur.status)) return { error: "A shipped order cannot be edited." };
    accountId = cur.account_id;
    const { error } = await db.from("orders").update(fields).eq("id", id);
    if (error) return { error: friendly(error) };
    const { error: delErr } = await db.from("order_lines").delete().eq("order_id", id);
    if (delErr) return { error: friendly(delErr) };
  } else {
    if (!accountId) return { error: "Choose the account." };
    const { data, error } = await db.from("orders").insert({ ...fields, account_id: accountId }).select("id").single();
    if (error) return { error: friendly(error) };
    orderId = data.id;
  }

  const { data: inserted, error: lineErr } = await db.from("order_lines")
    .insert(lines.map((l, i) => ({
      order_id: orderId!, account_id: accountId, sku_id: l.sku_id, description: l.description, qty: l.qty,
      unit_price_usd: l.unit_price, battery_new: l.battery_new, battery_unit_usd: l.battery_unit, sort_order: i,
    })))
    .select("id, sort_order");
  if (lineErr) return { error: friendly(lineErr) };

  if (user.role === "admin") {
    const fin = (inserted ?? [])
      .map((r) => ({ order_line_id: r.id, base_price_usd: lines[r.sort_order]?.base_price ?? null }))
      .filter((r) => r.base_price_usd !== null);
    if (fin.length) await db.from("order_lines_finance").insert(fin);
  }
  refresh(orderId!, accountId);
  redirect(`/orders/${orderId}`);
}

export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<ActionState> {
  await requireRole(STAFF);
  if (!ORDER_STATUSES.includes(status)) return { error: "Unknown status." };
  const db = await createClient();
  const { data, error } = await db.from("orders").update({ status }).eq("id", orderId).select("account_id").maybeSingle();
  if (error) return { error: friendly(error) };
  if (!data) return { error: "You do not have access to this order." };
  await onOrderStatusChange(orderId, status); // WhatsApp utility template: active once an order-status template is approved
  refresh(orderId, data.account_id);
  return { ok: true };
}

export async function recordPayment(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(STAFF);
  const db = await createClient();
  const orderId = str(fd, "order_id");
  const amount = num(fd, "amount");
  if (!(amount > 0)) return { error: "Enter the amount on the proof." };
  const reason = opt(fd, "difference_reason");
  const { error } = await db.from("payments").insert({
    order_id: orderId, account_id: str(fd, "account_id"), type: (str(fd, "type") || "deposit") as PaymentType, amount,
    method: (str(fd, "method") || "wire") as PaymentMethod, received_at: str(fd, "received_at") || new Date().toISOString().slice(0, 10),
    reference: opt(fd, "reference"), difference_reason: reason, notes: opt(fd, "notes"), proof_file_id: opt(fd, "proof_file_id"),
  });
  if (error) return { error: friendly(error) };
  refresh(orderId, str(fd, "account_id"));
  return { ok: true, message: "Recorded. An admin confirms it before it counts as paid (SOP P3)." };
}

export async function confirmPayment(paymentId: string, reason: string | null): Promise<ActionState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const { data, error } = await db.from("payments")
    .update({ status: "confirmed", ...(reason ? { difference_reason: reason } : {}) })
    .eq("id", paymentId).select("order_id, account_id").maybeSingle();
  if (error) return { error: friendly(error) };
  if (data) refresh(data.order_id, data.account_id);
  return { ok: true };
}

export async function deletePayment(paymentId: string): Promise<ActionState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const { data, error } = await db.from("payments").delete().eq("id", paymentId).select("order_id, account_id").maybeSingle();
  if (error) return { error: friendly(error) };
  if (data) refresh(data.order_id, data.account_id);
  return { ok: true };
}

export async function saveShipping(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(STAFF);
  const db = await createClient();
  const id = str(fd, "order_id");
  const { data, error } = await db.from("orders").update({
    courier: opt(fd, "courier"), tracking: opt(fd, "tracking"), eta_date: opt(fd, "eta_date"),
    delivery_setup: (str(fd, "delivery_setup") || "client_label") as DeliverySetup,
  }).eq("id", id).select("account_id").maybeSingle();
  if (error) return { error: friendly(error) };
  if (!data) return { error: "You do not have access to this order." };
  refresh(id, data.account_id);
  return { ok: true, message: "Saved." };
}

// SOP P4: the IMEI list from Hong Kong goes into the IMEI Master. Each IMEI exists once; a number
// already in the master (this or another order) is reported, not loaded again.
export async function loadImeis(orderId: string, text: string): Promise<ActionState & { added?: number; duplicates?: string[]; invalid?: string[] }> {
  await requireRole(STAFF);
  const db = await createClient();
  const { data: order } = await db.from("orders").select("id, account_id, status").eq("id", orderId).maybeSingle();
  if (!order) return { error: "Order not found." };
  const parsed = parseImeis(text);
  if (!parsed.valid.length) return { error: "No valid 15-digit IMEI found in the file.", invalid: [...parsed.badCheckDigit, ...parsed.wrongLength] };
  const { data: skus } = await db.from("order_lines").select("sku_id").eq("order_id", orderId);
  const distinct = [...new Set((skus ?? []).map((s) => s.sku_id).filter(Boolean))];
  const sku = distinct.length === 1 ? distinct[0] : null;
  let added = 0;
  const addedSet = new Set<string>();
  for (let i = 0; i < parsed.valid.length; i += 500) {
    const chunk = parsed.valid.slice(i, i + 500);
    const { data, error } = await db.from("imei_master")
      .upsert(chunk.map((imei) => ({ imei, order_id: orderId, account_id: order.account_id, sku_id: sku })), { onConflict: "imei", ignoreDuplicates: true })
      .select("imei");
    if (error) return { error: friendly(error) };
    for (const r of data ?? []) addedSet.add(r.imei);
    added += data?.length ?? 0;
  }
  const duplicates = parsed.valid.filter((x) => !addedSet.has(x));
  const user = await requireRole(STAFF);
  await db.from("order_events").insert({
    order_id: orderId, account_id: order.account_id, kind: "shipping", user_id: user.id,
    body: `IMEI list loaded: ${added} new${duplicates.length ? `, ${duplicates.length} already in the IMEI master` : ""}${parsed.badCheckDigit.length + parsed.wrongLength.length ? `, ${parsed.badCheckDigit.length + parsed.wrongLength.length} invalid` : ""}.`,
  });
  refresh(orderId, order.account_id);
  return { ok: true, added, duplicates, invalid: [...parsed.badCheckDigit, ...parsed.wrongLength] };
}

export async function addOrderNote(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(STAFF);
  const db = await createClient();
  const body = str(fd, "body");
  if (!body) return { error: "Write the note first." };
  const { error } = await db.from("order_events").insert({
    order_id: str(fd, "order_id"), account_id: str(fd, "account_id"), kind: "note", body, user_id: user.id,
  });
  if (error) return { error: friendly(error) };
  refresh(str(fd, "order_id"));
  return { ok: true };
}
