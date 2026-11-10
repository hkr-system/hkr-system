import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAddresses, loadFormAccounts, loadIntermediaries, loadSkus, loadTerms } from "@/lib/orders/service";
import { loadApprovedPrices } from "@/lib/price-lists/service";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { SALES_TABS } from "@/lib/sales/tabs";
import { InvoiceImport } from "@/components/orders/invoice-import";

export const metadata: Metadata = { title: "Import invoice" };

// Sales → Import invoice (Excel) (Gabriel, Nov 9 2026): an invoice made in Excel becomes an order. Admin + specialist.
export default async function ImportInvoicePage() {
  const access = await checkSection("orders");
  if (!access.allowed) return <NoAccess />;
  if (!["admin", "account_specialist"].includes(access.user.role ?? "")) return <NoAccess />;
  const db = await createClient();
  const [accounts, skus, terms, prices, intermediaries, addresses] = await Promise.all([
    loadFormAccounts(db), loadSkus(db), loadTerms(db), loadApprovedPrices(db), loadIntermediaries(db), loadAddresses(db),
  ]);
  return (
    <>
      <PageHeader title="Import invoice (Excel)" description="Upload an HKR invoice made in Excel: the system reads it, shows the order to check, and registers the sale." />
      <SectionTabs tabs={SALES_TABS} />
      <InvoiceImport accounts={accounts} skus={skus} isAdmin={access.user.role === "admin"} terms={terms} prices={prices}
        intermediaries={intermediaries} addresses={addresses} />
    </>
  );
}
