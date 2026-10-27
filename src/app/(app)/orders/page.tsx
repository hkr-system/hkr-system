import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { OPEN_ORDER_STATUSES, ORDER_STATUSES, money, type OrderStatus } from "@/lib/orders/constants";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { StatTile } from "@/components/viz";
import { OrderFilters } from "@/components/orders/order-filters";
import { SectionTabs } from "@/components/sales/tabs";
import { SALES_TABS } from "@/lib/sales/tabs";
import { OrdersTable, type OrderRow } from "@/components/orders/orders-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const sp = await searchParams;
  const p = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const db = await createClient();

  let q = db.from("order_overview").select("*").order("order_date", { ascending: false }).limit(500);
  const status = p("status");
  if (!status) q = q.in("status", OPEN_ORDER_STATUSES);
  else if ((ORDER_STATUSES as readonly string[]).includes(status)) q = q.eq("status", status as OrderStatus);
  if (/^[0-9a-f-]{36}$/.test(p("account"))) q = q.eq("account_id", p("account"));
  if (["EU", "LATAM", "US", "ROW"].includes(p("market"))) q = q.eq("market", p("market") as "EU");

  const [{ data }, { data: accounts }, { data: openAll }] = await Promise.all([
    q,
    db.from("accounts").select("id, code, name").order("code"),
    db.from("order_overview").select("*").in("status", OPEN_ORDER_STATUSES),
  ]);
  let rows = (data ?? []) as unknown as OrderRow[];
  const att = p("attention");
  const needs = {
    confirm: (o: OrderRow) => o.payment_awaiting,
    deposit: (o: OrderRow) => o.status === "invoiced" && o.deposit_confirmed <= 0,
    balance: (o: OrderRow) => o.status === "ready_to_ship" && !o.balance_ok,
    eta: (o: OrderRow) => ["deposit_paid", "in_preparation"].includes(o.status) && !o.eta_date,
    ship: (o: OrderRow) => o.status === "balance_paid",
  } as const;
  if (att in needs) rows = rows.filter(needs[att as keyof typeof needs]);
  const open = (openAll ?? []) as unknown as OrderRow[];
  const count = (k: keyof typeof needs) => open.filter(needs[k]).length;
  const openUsd = open.reduce((s, o) => s + Number(o.total_usd), 0);

  return (
    <>
      <PageHeader title="All orders" description={`${rows.length} order${rows.length === 1 ? "" : "s"} shown.`}>
        <Button asChild size="sm"><Link href="/orders/new">New order</Link></Button>
      </PageHeader>
      <SectionTabs tabs={SALES_TABS} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="order-kpis">
        <StatTile label="Open orders" value={open.length} sub={money(openUsd)} href="/orders" />
        <StatTile label="Payment to confirm" value={count("confirm")} tone="attention" href="/orders?attention=confirm" />
        <StatTile label="Deposit due" value={count("deposit")} tone="attention" href="/orders?attention=deposit" />
        <StatTile label="Ready, balance due" value={count("balance")} tone="attention" href="/orders?attention=balance" />
        <StatTile label="ETA pending" value={count("eta")} tone="attention" href="/orders?attention=eta" />
        <StatTile label="To ship" value={count("ship")} href="/orders?attention=ship" />
      </div>
      <OrderFilters accounts={accounts ?? []} />
      <Card><CardContent className="px-0"><OrdersTable orders={rows} today={todayIn(user.timezone)} /></CardContent></Card>
    </>
  );
}
