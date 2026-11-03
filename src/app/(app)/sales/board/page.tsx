import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { buildOrderBoard, RECENT_DAYS, type BoardOrder } from "@/lib/orders/board";
import type { OrderStatus } from "@/lib/orders/constants";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { SALES_TABS } from "@/lib/sales/tabs";
import { OrderBoard } from "@/components/orders/order-board";

export const metadata: Metadata = { title: "Orders board" };

// Every order left to right by status, with what each one still needs (Gabriel, Nov 3 2026). RLS: bd sees her accounts.
export default async function OrdersBoardPage() {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  const today = todayIn(access.user.timezone);
  const db = await createClient();
  const [{ data: ov }, { data: orders }, { data: events }] = await Promise.all([
    db.from("order_overview").select("id, number, account_code, status, total_usd, pieces, order_date, eta_date, payment_awaiting, deposit_payable, deposit_confirmed, balance_ok, imei_count, label_ok").limit(3000),
    db.from("orders").select("id, tracking").limit(3000),
    db.from("order_events").select("order_id, created_at").eq("kind", "status").order("created_at", { ascending: false }).limit(10000),
  ]);
  const since = new Map<string, string>();
  for (const e of events ?? []) if (!since.has(e.order_id)) since.set(e.order_id, e.created_at.slice(0, 10)); // newest status change
  const awb = new Map((orders ?? []).map((o) => [o.id, o.tracking]));
  const rows: BoardOrder[] = (ov ?? []).map((o) => ({
    id: o.id!, number: o.number!, account_code: o.account_code!, status: o.status as OrderStatus, total_usd: Number(o.total_usd), pieces: o.pieces ?? 0,
    order_date: o.order_date!, eta_date: o.eta_date, since: since.get(o.id!) ?? null, payment_awaiting: Boolean(o.payment_awaiting),
    deposit_payable: Number(o.deposit_payable), deposit_confirmed: Number(o.deposit_confirmed), balance_ok: Boolean(o.balance_ok),
    imei_count: o.imei_count ?? 0, label_ok: Boolean(o.label_ok), tracking: awb.get(o.id!) ?? null,
  }));
  const columns = buildOrderBoard(rows, today);
  return (
    <>
      <PageHeader title="Orders board" description={`Each order by status, longest waiting on top, with what it still needs. Delivered and Closed: last ${RECENT_DAYS} days. Click a card to open the order.`} />
      <SectionTabs tabs={SALES_TABS} />
      <OrderBoard columns={columns} />
    </>
  );
}
