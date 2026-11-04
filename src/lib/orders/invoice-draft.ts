import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { countryName } from "@/lib/leads/countries";
import { buildInvoiceLines, type InvoiceLine } from "@/lib/documents/invoice-lines";
import { splitLines } from "@/lib/documents/invoice";
import { batteryLineEligible, colorsFor } from "@/lib/orders/colors";

type DB = SupabaseClient<Database>;

export type InvoiceDraftData = {
  account_id: string;
  billing_entity: Database["public"]["Enums"]["billing_entity"];
  payment_method: Database["public"]["Enums"]["payment_method"];
  consignee: string; ship_to: string;
  notify: { contact: string; address: string; phone: string };
  shipment: { country: string; reference: string; awb: string; airport: string };
  lines: InvoiceLine[]; total_usd: number; orderTotal: number;
};

// Everything the invoice needs, read from the order, its account and its first contact (SOP P1 data).
export async function invoiceDraftFromOrder(db: DB, orderId: string): Promise<InvoiceDraftData | null> {
  const [{ data: o }, { data: lines }, { data: fee }, { data: credits }, { data: charges }] = await Promise.all([
    db.from("orders").select("*, accounts(id, name, legal_name, country, billing_address, company_ids, vat_eori, invoice_format, billing_entity)").eq("id", orderId).maybeSingle(),
    db.from("order_lines").select("qty, unit_price_usd, battery_new, battery_unit_usd, battery_option, description, model, storage_gb, colors_mixed, colors, ce_marked, imei_matching_color, skus(model, storage_gb, color, grade, battery_eligible)").eq("order_id", orderId).order("sort_order"),
    db.from("settings").select("value").eq("key", "usdt_fee_pct").maybeSingle(),
    db.from("credit_note_applications").select("amount_usd, created_at, credit_notes(number)").eq("order_id", orderId).order("created_at"),
    db.from("order_charges").select("description, qty, unit_usd, amount_usd").eq("order_id", orderId).order("sort_order"),
  ]);
  if (!o) return null;
  const acc = o.accounts as unknown as {
    id: string; name: string; legal_name: string | null; country: string | null; billing_address: string | null; company_ids: string | null;
    vat_eori: string | null; invoice_format: { battery_line_separate?: boolean; show_ce_text?: boolean; plain_lines?: boolean } | null; billing_entity: InvoiceDraftData["billing_entity"];
  };
  const { data: contacts } = await db.from("contacts").select("name, phone_e164, email").eq("account_id", acc.id).order("created_at").limit(1);
  const ship = (o.ship_to ?? {}) as Record<string, string>;
  const shipIso = ship.country || acc.country || null;
  const shipCountry = shipIso ? countryName(shipIso) : null;
  // the ORDER's invoice format (Nov 3 2026); orders without one fall back to the account's
  const own = (o as unknown as { invoice_format: typeof acc.invoice_format }).invoice_format;
  const fmt = (own && Object.keys(own).length ? own : acc.invoice_format) ?? {};
  const built = buildInvoiceLines({
    lines: (lines ?? []).map((l) => {
      const s = l.skus as { model: string; storage_gb: number; color: string; grade: string; battery_eligible: boolean } | null;
      const model = l.model ?? s?.model ?? null;
      const split = (l.colors as { color: string; qty: number }[] | null) ?? [];
      return {
        qty: l.qty, unitPrice: Number(l.unit_price_usd), batteryNew: l.battery_new, batteryUnit: Number(l.battery_unit_usd),
        batteryEligible: s?.battery_eligible ?? batteryLineEligible(model), model, storageGb: l.storage_gb ?? s?.storage_gb ?? null,
        color: split.length || l.colors_mixed ? null : s?.color ?? null, grade: s?.grade ?? null, description: l.description,
        colorsMixed: l.colors_mixed, colorSplit: split, ce: l.ce_marked, imeiMatching: l.imei_matching_color, batteryOption: l.battery_option,
      };
    }),
    batteryLineSeparate: fmt.battery_line_separate ?? true,
    ceText: fmt.show_ce_text ? (shipIso === "GB" ? "UKCA" : "CE Marked") : null,
    ceLabel: shipIso === "GB" ? "UKCA" : "CE Marked",
    plain: Boolean(fmt.plain_lines),
    freight: Number(o.freight_usd), customs: Number(o.customs_usd), rmaDiscount: Number(o.rma_discount_usd),
    // per unit → qty × US$/unit on the invoice; one total → one amount (Nov 4 2026)
    freightUnit: o.freight_mode === "unit" ? Number(o.freight_unit_usd ?? 0) : null,
    customsUnit: o.customs_mode === "unit" ? Number(o.customs_unit_usd ?? 0) : null,
    charges: (charges ?? []).map((c) => ({ description: c.description, qty: c.qty, unit: c.unit_usd === null ? null : Number(c.unit_usd), amount: Number(c.amount_usd) })),
    credits: (credits ?? []).map((c) => ({ number: (c.credit_notes as unknown as { number: string }).number, amount: Number(c.amount_usd) })),
    paymentMethod: o.payment_method, usdtFeePct: Number(fee?.value ?? 0.85), shipCountry,
  }, (model, color) => colorsFor(model).find((c) => c.name === color)?.plain ?? null);
  const address = splitLines(acc.billing_address);
  const c = contacts?.[0];
  return {
    account_id: acc.id,
    billing_entity: acc.billing_entity,
    payment_method: o.payment_method,
    consignee: [acc.legal_name || acc.name, ...address, acc.vat_eori ? `VAT / EORI: ${acc.vat_eori}` : "", ...splitLines(acc.company_ids)].filter(Boolean).join("\n"),
    ship_to: [ship.name || acc.legal_name || acc.name, ship.address, ship.city, shipCountry, ship.phone].filter(Boolean).join("\n"),
    notify: {
      contact: ship.contact || c?.name || acc.legal_name || acc.name,
      address: address[0] ?? "",
      phone: [ship.phone || c?.phone_e164, c?.email].filter(Boolean).join(" / "),
    },
    shipment: { country: shipCountry ?? "", reference: "N/A", awb: o.tracking || "N/A", airport: "" },
    lines: built.lines, total_usd: built.total, orderTotal: Number(o.total_usd),
  };
}
