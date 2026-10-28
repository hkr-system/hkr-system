"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FAULT_CATEGORIES, RMA_STATUSES, RESOLUTIONS, UNIT_STATUSES, type RmaResolution, type RmaStatus, type RmaUnitStatus } from "@/lib/rmas/constants";

export type ActionState = { ok?: boolean; error?: string; message?: string; id?: string };

const STAFF = ["admin", "bd", "account_specialist"] as const;

function friendly(e: { code?: string; message: string }) {
  if (e.code === "23505") return "This IMEI is already in this RMA (DUPLICATE).";
  if (e.code === "23514" && /fault_category/.test(e.message)) return "Choose a fault category from the list.";
  if (e.code === "42501" && !/admin|only/i.test(e.message)) return "You do not have access to do this.";
  return e.message;
}

function refresh(rmaId?: string, accountId?: string) {
  revalidatePath("/rmas");
  if (rmaId) revalidatePath(`/rmas/${rmaId}`);
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

export type UnitInput = {
  imei: string; model?: string | null; storage_gb?: number | null; color?: string | null; fault_category: string;
  fault_text?: string | null; source?: "testing" | "end_customer"; detected_on?: string | null;
  battery_swollen?: boolean; physical_damage?: boolean;
};

function cleanUnits(units: UnitInput[]): { units: UnitInput[]; problem?: string } {
  const out: UnitInput[] = [];
  const seen = new Set<string>();
  for (const [i, u] of units.entries()) {
    const imei = String(u.imei ?? "").replace(/\D/g, "");
    if (!imei) continue;
    if (imei.length !== 15) return { units: out, problem: `Line ${i + 1}: the IMEI must have 15 digits.` };
    if (seen.has(imei)) return { units: out, problem: `Line ${i + 1}: IMEI ${imei} is repeated (DUPLICATE).` };
    seen.add(imei);
    const cat = (FAULT_CATEGORIES as readonly string[]).includes(u.fault_category) ? u.fault_category : "Other";
    out.push({
      imei, model: u.model || null, storage_gb: u.storage_gb ? Number(u.storage_gb) : null, color: u.color || null,
      fault_category: cat, fault_text: u.fault_text?.trim() || null, source: u.source === "end_customer" ? "end_customer" : "testing",
      detected_on: u.detected_on || null, battery_swollen: Boolean(u.battery_swollen), physical_damage: Boolean(u.physical_damage),
    });
  }
  if (!out.length) return { units: out, problem: "Add at least one unit with its IMEI." };
  return { units: out };
}

// New RMA typed by the team or imported from the client's xlsx form (SOP P6).
export async function createRma(input: {
  accountId: string; channel: "internal" | "import"; location: string | null; orderRefs: string | null;
  contactName: string | null; contactInfo: string | null; clientNotes: string | null; internalNotes: string | null;
  units: UnitInput[];
}): Promise<ActionState> {
  await requireRole(STAFF);
  const { units, problem } = cleanUnits(input.units);
  if (problem) return { error: problem };
  const db = await createClient();
  const { data: rma, error } = await db.from("rmas").insert({
    account_id: input.accountId, channel: input.channel, status: "form_received",
    units_location: (input.location || null) as never, order_refs: input.orderRefs, contact_name: input.contactName,
    contact_info: input.contactInfo, client_notes: input.clientNotes, internal_notes: input.internalNotes,
  }).select("id").single();
  if (error) return { error: friendly(error) };
  const { error: e2 } = await db.from("rma_units").insert(units.map((u, i) => ({ ...u, rma_id: rma.id, account_id: input.accountId, sort_order: i + 1 })));
  if (e2) {
    await db.from("rmas").delete().eq("id", rma.id);
    return { error: friendly(e2) };
  }
  refresh(rma.id, input.accountId);
  return { ok: true, id: rma.id };
}

export async function addUnits(rmaId: string, raw: UnitInput[]): Promise<ActionState> {
  await requireRole(STAFF);
  const { units, problem } = cleanUnits(raw);
  if (problem) return { error: problem };
  const db = await createClient();
  const { data: rma } = await db.from("rmas").select("account_id").eq("id", rmaId).single();
  if (!rma) return { error: "RMA not found." };
  const { count } = await db.from("rma_units").select("id", { count: "exact", head: true }).eq("rma_id", rmaId);
  const { error } = await db.from("rma_units").insert(units.map((u, i) => ({ ...u, rma_id: rmaId, account_id: rma.account_id, sort_order: (count ?? 0) + i + 1 })));
  if (error) return { error: friendly(error) };
  refresh(rmaId);
  return { ok: true, message: `${units.length} unit${units.length === 1 ? "" : "s"} added.` };
}

export async function updateUnit(unitId: string, patch: {
  resolution?: RmaResolution; unit_status?: RmaUnitStatus; credit_pct?: number | null; credit_fixed_usd?: number | null;
  unit_price_usd?: number | null; hkr_notes?: string | null; battery_swollen?: boolean; physical_damage?: boolean;
  fault_category?: string; fault_text?: string | null;
}): Promise<ActionState> {
  await requireRole(STAFF);
  if (patch.resolution && !RESOLUTIONS.includes(patch.resolution)) return { error: "Unknown resolution." };
  if (patch.unit_status && !UNIT_STATUSES.includes(patch.unit_status)) return { error: "Unknown unit status." };
  const db = await createClient();
  const { data, error } = await db.from("rma_units").update(patch).eq("id", unitId).select("rma_id").single();
  if (error) return { error: friendly(error) };
  refresh(data.rma_id);
  return { ok: true };
}

export async function deleteUnit(unitId: string): Promise<ActionState> {
  await requireRole(STAFF);
  const db = await createClient();
  const { data: u } = await db.from("rma_units").select("rma_id").eq("id", unitId).single();
  const { error, count } = await db.from("rma_units").delete({ count: "exact" }).eq("id", unitId);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "Units of an approved RMA are removed only by an admin." };
  refresh(u?.rma_id);
  return { ok: true };
}

export async function setRmaStatus(rmaId: string, status: RmaStatus): Promise<ActionState> {
  await requireRole(STAFF);
  if (!RMA_STATUSES.includes(status)) return { error: "Unknown status." };
  const db = await createClient();
  const { error } = await db.from("rmas").update({ status }).eq("id", rmaId);
  if (error) return { error: friendly(error) };
  refresh(rmaId);
  return { ok: true };
}

export async function saveRmaNotes(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole(STAFF);
  const id = String(fd.get("id"));
  const db = await createClient();
  const { error } = await db.from("rmas").update({
    internal_notes: String(fd.get("internal_notes") ?? "").trim() || null,
    units_location: (String(fd.get("units_location") ?? "") || null) as never,
    order_refs: String(fd.get("order_refs") ?? "").trim() || null,
  }).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh(id);
  return { ok: true, message: "Saved." };
}

export async function deleteRma(rmaId: string) {
  await requireRole(["admin"]);
  const db = await createClient();
  const { error } = await db.from("rmas").delete().eq("id", rmaId);
  if (error) return { error: friendly(error) };
  revalidatePath("/rmas");
  redirect("/rmas");
}

// Credit note prepared from the credit units of an approved RMA (SOP P10: one line per concept).
export async function createCreditNoteFromRma(rmaId: string): Promise<ActionState> {
  await requireRole(STAFF);
  const db = await createClient();
  const { data: r } = await db.from("rmas").select("id, account_id, status, accounts(legal_name, name, currency)").eq("id", rmaId).single();
  if (!r) return { error: "RMA not found." };
  if ((RMA_STATUSES.indexOf(r.status) < RMA_STATUSES.indexOf("approved"))) return { error: "Approve the RMA first (the Sales Director agrees the amounts)." };
  const { data: units } = await db.from("rma_units").select("imei, model, storage_gb, credit_usd, resolution, origin_order_id")
    .eq("rma_id", rmaId).in("resolution", ["repair_credit", "credit_note"]).order("sort_order");
  const credit = (units ?? []).filter((u) => Number(u.credit_usd) > 0);
  if (!credit.length) return { error: "No unit of this RMA has a credit amount." };
  const order = credit.find((u) => u.origin_order_id)?.origin_order_id ?? null;
  const { data: o } = order ? await db.from("orders").select("hk_invoice_no").eq("id", order).single() : { data: null };
  const acc = r.accounts as unknown as { legal_name: string | null; name: string };
  const { data: cn, error } = await db.from("credit_notes").insert({
    account_id: r.account_id, rma_id: rmaId, order_id: order, invoice_no: o?.hk_invoice_no ?? null,
    in_favor_of: acc.legal_name ?? acc.name, currency: "USD", reason: "RMA credit", applied_to: "next_invoice",
  }).select("id").single();
  if (error) return { error: friendly(error) };
  const { error: e2 } = await db.from("credit_note_lines").insert(credit.map((u, i) => ({
    credit_note_id: cn.id, account_id: r.account_id, sort_order: i + 1, qty: 1, unit_price: Number(u.credit_usd),
    description: `${u.resolution === "repair_credit" ? "Repair credit" : "Credit"} — ${[u.model, u.storage_gb ? `${u.storage_gb}GB` : ""].filter(Boolean).join(" ")} · IMEI ${u.imei}`,
  })));
  if (e2) return { error: friendly(e2) };
  refresh(rmaId, r.account_id);
  return { ok: true, id: cn.id };
}
