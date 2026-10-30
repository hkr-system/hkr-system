import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { countryName } from "@/lib/leads/countries";
import { buildInvoiceLines, type InvoiceLine } from "@/lib/documents/invoice-lines";
import { splitLines } from "@/lib/documents/invoice";

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
  const [{ data: o }, { data: lines }, { data: fee }] = await Promise.all([
    db.from("orders").select("*, accounts(id, name, legal_name, country, billing_address, company_ids, vat_eori, invoice_format, billing_entity)").eq("id", orderId).maybeSingle(),
    db.from("order_lines").select("qty, unit_price_usd, battery_new, battery_unit_usd, description, skus(model, storage_gb, color, grade, battery_eligible)").eq("order_id", orderId).order("sort_order"),
    db.from("settings").select("value").eq("key", "usdt_fee_pct").maybeSingle(),
  ]);
  if (!o) return null;
  const acc = o.accounts as unknown as {
    id: string; name: string; legal_name: string | null; country: string | null; billing_address: string | null; company_ids: string | null;
    vat_eori: string | null; invoice_format: { battery_line_separate?: boolean; show_ce_text?: boolean } | null; billing_entity: InvoiceDraftData["billing_entity"];
  };
  const { data: contacts } = await db.from("contacts").select("name, phone_e164, email").eq("account_id", acc.id).order("created_at").limit(1);
  const ship = (o.ship_to ?? {}) as Record<string, string>;
  const shipIso = ship.country || acc.country || null;
  const shipCountry = shipIso ? countryName(shipIso) : null;
  const fmt = acc.invoice_format ?? {};
  const built = buildInvoiceLines({
    lines: (lines ?? []).map((l) => {
      const s = l.skus as { model: string; storage_gb: number; color: string; grade: string; battery_eligible: boolean } | null;
      return {
        qty: l.qty, unitPrice: Number(l.unit_price_usd), batteryNew: l.battery_new, batteryUnit: Number(l.battery_unit_usd),
        batteryEligible: s?.battery_eligible ?? true, model: s?.model ?? null, storageGb: s?.storage_gb ?? null,
        color: s?.color ?? null, grade: s?.grade ?? null, description: l.description,
      };
    }),
    batteryLineSeparate: fmt.battery_line_separate ?? true,
    ceText: fmt.show_ce_text ? (shipIso === "GB" ? "UKCA" : "CE Marked") : null,
    freight: Number(o.freight_usd), customs: Number(o.customs_usd), rmaDiscount: Number(o.rma_discount_usd),
    paymentMethod: o.payment_method, usdtFeePct: Number(fee?.value ?? 0.85), shipCountry,
  });
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
