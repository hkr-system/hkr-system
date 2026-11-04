import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAddresses, loadFormAccounts, loadIntermediaries, loadSkus, loadTerms } from "@/lib/orders/service";
import { loadApprovedPrices } from "@/lib/price-lists/service";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { OrderForm, type Line } from "@/components/orders/order-form";
import { modelKey } from "@/lib/price-lists/models";

export const metadata: Metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: PageProps<"/orders/[id]/edit">) {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  const { id } = await params;
  const db = await createClient();
  const isAdmin = access.user.role === "admin";
  const [{ data: o }, { data: lines }, accounts, skus, terms, prices, intermediaries, addresses] = await Promise.all([
    db.from("orders").select("*, accounts(code)").eq("id", id).maybeSingle(),
    db.from("order_lines").select("id, sku_id, skus(model, storage_gb, color), model, storage_gb, description, qty, unit_price_usd, battery_new, battery_unit_usd, battery_option, colors_mixed, colors, ce_marked, imei_matching_color, price_list_row_id, list_price_usd").eq("order_id", id).order("sort_order"),
    loadFormAccounts(db), loadSkus(db), loadTerms(db), loadApprovedPrices(db), loadIntermediaries(db), loadAddresses(db),
  ]);
  if (!o) notFound();
  const fin = isAdmin && lines?.length
    ? (await db.from("order_lines_finance").select("order_line_id, base_price_usd").in("order_line_id", lines.map((l) => l.id))).data ?? []
    : [];
  const base = new Map(fin.map((f) => [f.order_line_id, f.base_price_usd]));
  if (["shipped", "delivered", "closed"].includes(o.status)) {
    return <p className="text-sm text-muted-foreground">A shipped order cannot be edited.</p>;
  }
  return (
    <>
      <PageHeader title={`Edit ${(o.accounts as { code: string } | null)?.code ?? ""} ${o.number}`} />
      <OrderForm accounts={accounts.filter((a) => a.id === o.account_id)} skus={skus} isAdmin={isAdmin} terms={terms} prices={prices}
        intermediaries={intermediaries} addresses={addresses.filter((x) => x.account_id === o.account_id)}
        values={{
          ...o, ship_to: (o.ship_to ?? {}) as Record<string, string>,
          invoice_format: (o.invoice_format ?? null) as Record<string, boolean> | null,
          lines: (lines ?? []).map((l) => {
            const sk = l.skus as { model: string; storage_gb: number; color: string } | null;   // a line from a one-colour SKU (before Nov 2 2026)
            const legacy = sk?.color;
            const model = l.model ?? sk?.model ?? null; const gb = l.storage_gb ?? sk?.storage_gb ?? null;
            const split = (l.colors as { color: string; qty: number }[]).length ? (l.colors as { color: string; qty: number }[]) : legacy && !l.colors_mixed ? [{ color: legacy, qty: l.qty }] : [];
            return ({
            key: model && gb ? modelKey(model, gb) : "", model: model ?? "", storage_gb: gb,
            description: l.description ?? "", qty: String(l.qty), unit_price: String(l.unit_price_usd),
            mixed: l.colors_mixed || !split.length,
            colors: Object.fromEntries(split.map((c) => [c.color, String(c.qty)])),
            ce: l.ce_marked, imei: l.imei_matching_color, battery: (l.battery_option ?? "") as Line["battery"],
            battery_unit: String(l.battery_unit_usd ?? ""), base_price: base.get(l.id) != null ? String(base.get(l.id)) : "",
            list_row_id: l.price_list_row_id ?? "", list_price: l.list_price_usd === null ? null : Number(l.list_price_usd), sku_id: l.sku_id ?? undefined,
          });
          }),
        }} />
    </>
  );
}
