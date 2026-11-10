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

type LineInput = {
  sku_id: string | null; model: string | null; storage_gb: number | null; description: string | null; qty: number; unit_price: number;
  colors_mixed: boolean; colors: { color: string; qty: number }[]; ce_marked: boolean; imei_matching_color: boolean;
  battery_option: "new" | "boosted100" | "bh85_boosted" | "bh80" | null; battery_unit: number; base_price: number | null; list_row_id: string | null;
  sim_option: "esim" | null;
};
const BATTERY = ["new", "boosted100", "bh85_boosted", "bh80"];

function parseLines(raw: string): { lines: LineInput[]; problem?: string } {
  let data: unknown;
  try { data = JSON.parse(raw || "[]"); } catch { return { lines: [], problem: "The order lines could not be read." }; }
  if (!Array.isArray(data)) return { lines: [], problem: "The order lines could not be read." };
  const lines: LineInput[] = [];
  for (const [i, l] of data.entries()) {
    const qty = Math.round(Number(l.qty));
    const price = Number(String(l.unit_price ?? "").replace(",", "."));
    const model = String(l.model ?? "").trim() || null;
    if (!l.sku_id && !model && !String(l.description ?? "").trim()) continue; // empty row
    if (!(qty > 0)) return { lines, problem: `Line ${i + 1}: quantity must be more than 0.` };
    if (!(price >= 0) || String(l.unit_price ?? "").trim() === "") return { lines, problem: `Line ${i + 1}: unit price is missing.` };
    const colors = (Array.isArray(l.colors) ? l.colors : [])
      .map((c: { color?: unknown; qty?: unknown }) => ({ color: String(c.color ?? "").trim(), qty: Math.round(Number(c.qty)) }))
      .filter((c: { color: string; qty: number }) => c.color && c.qty > 0);
    const mixed = Boolean(l.colors_mixed) || (!colors.length && !l.sku_id);
    const sum = colors.reduce((t: number, c: { qty: number }) => t + c.qty, 0);
    if (!mixed && colors.length && sum !== qty) return { lines, problem: `Line ${i + 1}: the colours add up to ${sum} but the line has ${qty} units.` };
    lines.push({
      sku_id: l.sku_id || null, model, storage_gb: Number(l.storage_gb) > 0 ? Math.round(Number(l.storage_gb)) : null,
      description: String(l.description ?? "").trim() || null, qty, unit_price: price,
      colors_mixed: mixed, colors: mixed ? [] : colors, ce_marked: Boolean(l.ce_marked), imei_matching_color: Boolean(l.imei_matching_color),
      battery_option: BATTERY.includes(l.battery_option) ? l.battery_option : null,
      sim_option: l.sim_option === "esim" ? "esim" : null,
      battery_unit: Number(String(l.battery_unit ?? "").replace(",", ".")) || 0,
      base_price: l.base_price === "" || l.base_price === null || l.base_price === undefined ? null : Number(l.base_price),
      list_row_id: typeof l.list_row_id === "string" && /^[0-9a-f-]{36}$/.test(l.list_row_id) ? l.list_row_id : null,
    });
  }
  if (!lines.length) return { lines, problem: "Add at least one line." };
  return { lines };
}

/** Other charges / discounts typed on the order form: description + amount, or qty × US$/unit. */
function parseCharges(json: string): { charges: { description: string; qty: number | null; unit: number | null; amount: number }[]; problem?: string } {
  let raw: unknown;
  try { raw = JSON.parse(json || "[]"); } catch { return { charges: [], problem: "The other charges could not be read." }; }
  const out: { description: string; qty: number | null; unit: number | null; amount: number }[] = [];
  for (const c of Array.isArray(raw) ? raw as Record<string, string>[] : []) {
    const d = String(c.description ?? "").trim();
    const n = (v: unknown) => Number(String(v ?? "").replace(",", ".").replace("−", "-"));
    const qty = String(c.qty ?? "").trim() ? Math.round(n(c.qty)) : null;
    const unit = String(c.unit ?? "").trim() ? Math.round(n(c.unit) * 100) / 100 : null;
    const amount = qty !== null && unit !== null ? Math.round(qty * unit * 100) / 100 : Math.round(n(c.amount) * 100) / 100;
    if (!d && !amount) continue;                       // an empty row is ignored
    if (!d) return { charges: [], problem: "Each other charge needs a description (it is printed on the invoice)." };
    if (qty !== null && !(qty > 0)) return { charges: [], problem: `${d}: the quantity must be a number above 0.` };
    if (!Number.isFinite(amount) || amount === 0) return { charges: [], problem: `${d}: write the amount (negative for a discount).` };
    out.push({ description: d, qty: qty !== null && unit !== null ? qty : null, unit: qty !== null && unit !== null ? unit : null, amount });
  }
  return { charges: out };
}

/** Route of an order: "" = direct, an id, or "new" = add a company (admin; RLS refuses others) with the typed name. */
// "Save for this client": the company becomes one of the client's suggestions (★ first on its orders), Nov 9 2026
async function rememberRoute(db: Awaited<ReturnType<typeof createClient>>, fd: FormData, accountId: string, intermediaryId: string | null) {
  if (!intermediaryId || !accountId || fd.get("save_route") !== "on") return;
  await db.from("account_intermediaries").upsert({ account_id: accountId, intermediary_id: intermediaryId }, { onConflict: "account_id,intermediary_id", ignoreDuplicates: true });
}

async function resolveIntermediary(db: Awaited<ReturnType<typeof createClient>>, fd: FormData): Promise<{ id: string | null; error?: string }> {
  const pick = str(fd, "intermediary_id");
  if (pick !== "new") return { id: pick || null };
  const name = str(fd, "new_intermediary").trim().replace(/\s+/g, " ");
  if (!name) return { id: null, error: "Write the name of the new intermediary." };
  const { data: same } = await db.from("intermediaries").select("id").ilike("name", name.replace(/[\\%_]/g, (c) => "\\" + c)).limit(1).maybeSingle();
  if (same) return { id: same.id };                  // "galimix" typed again = the Galimix already saved
  const { data: im, error } = await db.from("intermediaries").insert({ name }).select("id").single();
  if (error) return { id: null, error: error.code === "42501" ? "Only an admin adds a new intermediary (Settings → Intermediaries)." : friendly(error) };
  return { id: im.id };
}

export async function saveOrder(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(STAFF);
  const db = await createClient();
  const id = opt(fd, "id");
  const { lines, problem } = parseLines(str(fd, "lines"));
  if (problem) return { error: problem };
  const { charges, problem: chargeProblem } = parseCharges(str(fd, "charges"));
  if (chargeProblem) return { error: chargeProblem };
  const fields = {
    order_date: str(fd, "order_date") || new Date().toISOString().slice(0, 10),
    payment_method: (str(fd, "payment_method") || "wire") as PaymentMethod,
    delivery_setup: (str(fd, "delivery_setup") || "client_label") as DeliverySetup,
    freight_usd: num(fd, "freight_usd"),
    customs_usd: num(fd, "customs_usd"),
    // per unit (US$ × units, kept up to date by the database) or one total for the shipment (Nov 4 2026)
    freight_mode: str(fd, "freight_mode") === "unit" ? "unit" : "total",
    freight_unit_usd: str(fd, "freight_mode") === "unit" ? num(fd, "freight_unit_usd") : null,
    customs_mode: str(fd, "customs_mode") === "unit" ? "unit" : "total",
    customs_unit_usd: str(fd, "customs_mode") === "unit" ? num(fd, "customs_unit_usd") : null,
    eta_date: opt(fd, "eta_date"),
    notes: opt(fd, "notes"),
    invoice_format: parseFormat(fd.get("invoice_format")),
    ship_to: {
      name: str(fd, "ship_name"), address: str(fd, "ship_address"), city: str(fd, "ship_city"),
      country: str(fd, "ship_country"), contact: str(fd, "ship_contact"), phone: str(fd, "ship_phone"), email: str(fd, "ship_email"),
    },
    // route + saved address per order (Gabriel, Nov 4 2026)
    intermediary_id: null as string | null,
    address_id: opt(fd, "address_id"),
  };
  const route = await resolveIntermediary(db, fd);
  if (route.error) return { error: route.error };
  fields.intermediary_id = route.id;

  let orderId = id;
  let accountId = str(fd, "account_id");
  if (id) {
    const { data: cur0 } = await db.from("orders").select("account_id").eq("id", id).maybeSingle();
    if (cur0) accountId = cur0.account_id;
  }
  // "+ New address…" → saved to the client's list (unless unticked) and used by this order
  const newLabel = str(fd, "new_address_label");
  if (newLabel && fd.get("new_address_save") === "on" && accountId) {
    const kind = (["client", "forwarder", "clearance", "other"].includes(str(fd, "new_address_kind")) ? str(fd, "new_address_kind") : "other") as "client" | "forwarder" | "clearance" | "other";
    const { data: addr, error: aErr } = await db.from("account_addresses").insert({
      account_id: accountId, label: newLabel, kind, company: fields.ship_to.name || null, contact_name: fields.ship_to.contact || null,
      phone: fields.ship_to.phone || null, email: fields.ship_to.email || null, address: fields.ship_to.address || null,
      city: fields.ship_to.city || null, country: fields.ship_to.country || null,
    }).select("id").single();
    if (aErr) return { error: friendly(aErr) };
    fields.address_id = addr.id;
  }
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
      order_id: orderId!, account_id: accountId, sku_id: l.sku_id, model: l.model, storage_gb: l.storage_gb, description: l.description,
      qty: l.qty, unit_price_usd: l.unit_price, battery_option: l.battery_option, battery_new: l.battery_option === "new",
      battery_unit_usd: l.battery_option === "new" ? l.battery_unit : 0, colors_mixed: l.colors_mixed, colors: l.colors,
      ce_marked: l.ce_marked, imei_matching_color: l.imei_matching_color, sim_option: l.sim_option, sort_order: i,
      price_list_row_id: l.list_row_id, // the database sets list price and source (list / manual)
    })))
    .select("id, sort_order");
  if (lineErr) return { error: friendly(lineErr) };

  // other charges / discounts: replaced as a whole, like the lines
  if (id) {
    const { error: cdErr } = await db.from("order_charges").delete().eq("order_id", orderId!);
    if (cdErr) return { error: friendly(cdErr) };
  }
  if (charges.length) {
    const { error: chErr } = await db.from("order_charges").insert(charges.map((c, i) => ({
      order_id: orderId!, account_id: accountId, description: c.description, qty: c.qty, unit_usd: c.unit, amount_usd: c.amount, sort_order: i,
    })));
    if (chErr) return { error: friendly(chErr) };
  }
  await rememberRoute(db, fd, accountId, fields.intermediary_id);
  const { data: tot } = await db.from("orders").select("total_usd").eq("id", orderId!).maybeSingle();
  if (tot && Number(tot.total_usd) < 0) return { error: "The discounts are larger than the order: the total is below zero. Correct them and save again." };

  if (user.role === "admin") {
    const fin = (inserted ?? [])
      .map((r) => ({ order_line_id: r.id, base_price_usd: lines[r.sort_order]?.base_price ?? null }))
      .filter((r) => r.base_price_usd !== null);
    if (fin.length) await db.from("order_lines_finance").upsert(fin); // a typed base price wins over the one from the list
  }
  refresh(orderId!, accountId);
  redirect(`/orders/${orderId}`);
}

// The intermediary's invoice arrives after ours (Gabriel, Nov 2 2026): number + EUR amount for reference, and whether
// the intermediary keeps the deposit (then we expect 100 % in USD when the order is ready).
export async function saveIntermediaryInvoice(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(STAFF);
  const db = await createClient();
  const orderId = str(fd, "order_id");
  const eur = str(fd, "partner_invoice_eur").replace(/,/g, "");
  if (eur && !(Number(eur) >= 0)) return { error: "Write the EUR amount as a number." };
  // intermediary of THIS order: any company (Global Connect, Galimix, DWT…); "" = direct, "new" = add a company (admin)
  const route = await resolveIntermediary(db, fd);
  if (route.error) return { error: route.error };
  const intermediary = route.id;
  const direct = !intermediary;
  const { data, error } = await db.from("orders").update({
    intermediary_id: direct ? null : intermediary,
    partner_invoice_no: direct ? null : opt(fd, "partner_invoice_no"),
    partner_invoice_eur: direct ? null : eur ? Number(eur) : null,
    deposit_with_intermediary: !direct && fd.get("deposit_with_intermediary") === "on",
  }).eq("id", orderId).select("account_id").maybeSingle();
  if (error) return { error: friendly(error) };
  if (!data) return { error: "You do not have access to this order." };
  await rememberRoute(db, fd, data.account_id, direct ? null : intermediary);
  refresh(orderId, data.account_id);
  return { ok: true };
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
  const method = (str(fd, "method") === "usdt" ? "usdt" : "wire") as PaymentMethod;   // one payment = wire OR USDT
  // a USDT payment of a MIXED order: the part of the invoice it covers; the database works out the 0.85 % and any loss
  const covers = str(fd, "usdt_covers") ? num(fd, "usdt_covers") : null;
  if (covers !== null && !(covers > 0)) return { error: "Write the part of the invoice this USDT payment covers (US$)." };
  const { error } = await db.from("payments").insert({
    order_id: orderId, account_id: str(fd, "account_id"), type: (str(fd, "type") || "deposit") as PaymentType, amount,
    method, usdt_covers_usd: method === "usdt" ? covers : null, received_at: str(fd, "received_at") || new Date().toISOString().slice(0, 10),
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

function parseFormat(raw: FormDataEntryValue | null) {
  try {
    const x = JSON.parse(String(raw ?? "{}")) as Record<string, unknown>;
    return { battery_line_separate: x.battery_line_separate !== false, show_ce_text: x.show_ce_text === true, plain_lines: x.plain_lines === true, show_note: x.show_note === true };
  } catch { return null; }
}
