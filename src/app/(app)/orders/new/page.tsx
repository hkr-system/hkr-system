import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFormAccounts, loadSkus, loadTerms } from "@/lib/orders/service";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { OrderForm } from "@/components/orders/order-form";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  const sp = await searchParams;
  const db = await createClient();
  const [accounts, skus, terms] = await Promise.all([loadFormAccounts(db), loadSkus(db), loadTerms(db)]);
  const account = typeof sp.account === "string" && accounts.some((a) => a.id === sp.account) ? sp.account : undefined;
  return (
    <>
      <PageHeader title="New order" description="Lines, totals with the 10/90 split, USDT fee and freight; the number ORD-NN is given on save." />
      {accounts.length ? (
        <OrderForm accounts={accounts} skus={skus} isAdmin={access.user.role === "admin"} terms={terms} values={{ account_id: account }} />
      ) : <p className="text-sm text-muted-foreground">You have no accounts to order for yet.</p>}
    </>
  );
}
