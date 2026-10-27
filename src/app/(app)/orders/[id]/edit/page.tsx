import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFormAccounts, loadSkus, loadTerms } from "@/lib/orders/service";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { OrderForm } from "@/components/orders/order-form";

export const metadata: Metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: PageProps<"/orders/[id]/edit">) {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  const { id } = await params;
  const db = await createClient();
  const isAdmin = access.user.role === "admin";
  const [{ data: o }, { data: lines }, accounts, skus, terms] = await Promise.all([
    db.from("orders").select("*, accounts(code)").eq("id", id).maybeSingle(),
    db.from("order_lines").select("id, sku_id, description, qty, unit_price_usd, battery_new, battery_unit_usd").eq("order_id", id).order("sort_order"),
    loadFormAccounts(db), loadSkus(db), loadTerms(db),
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
      <OrderForm accounts={accounts.filter((a) => a.id === o.account_id)} skus={skus} isAdmin={isAdmin} terms={terms}
        values={{
          ...o, ship_to: (o.ship_to ?? {}) as Record<string, string>,
          lines: (lines ?? []).map((l) => ({
            sku_id: l.sku_id ?? "", description: l.description ?? "", qty: String(l.qty), unit_price: String(l.unit_price_usd),
            battery_new: l.battery_new, battery_unit: String(l.battery_unit_usd ?? ""), base_price: base.get(l.id) != null ? String(base.get(l.id)) : "",
          })),
        }} />
    </>
  );
}
