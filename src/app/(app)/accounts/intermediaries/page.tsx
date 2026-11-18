import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { accountTabs } from "@/lib/sales/tabs";
import { loadIntermediaryRows } from "@/lib/orders/intermediary-rows";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { EditLock } from "@/components/edit-lock";
import { Card, CardContent } from "@/components/ui/card";
import { IntermediariesEditor } from "../../settings/intermediaries";

export const metadata: Metadata = { title: "Intermediaries & clearance" };

// Accounts → Intermediaries & clearance (Gabriel, Nov 18 2026): the specialist onboards accounts, so she adds and edits the
// companies HKR invoices instead of the client. Same list as Settings; removing one stays admin only.
export default async function IntermediariesPage() {
  const access = await checkSection("accounts");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  if (user.role !== "admin" && user.role !== "account_specialist") return <NoAccess message="Only the admin and the account specialist manage intermediaries." />;
  const rows = await loadIntermediaryRows(await createClient());
  return (
    <>
      <PageHeader title="Intermediaries & clearance companies"
        description="Companies HKR invoices instead of the client (Galimix, Global Connect, Barry Trading…). They pay us in USD and appear as the Ultimate consignee. Each order picks its route from this list." />
      <SectionTabs tabs={accountTabs(true)} />
      <Card className="relative">
        <CardContent className="pt-6">
          <EditLock>
            <IntermediariesEditor rows={rows} canDelete={user.role === "admin"} />
          </EditLock>
        </CardContent>
      </Card>
    </>
  );
}
