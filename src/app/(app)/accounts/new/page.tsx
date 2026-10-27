import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadTeam } from "@/lib/leads/service";
import { loadIntermediaries, loadTerms } from "@/lib/orders/service";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { AccountForm } from "@/components/accounts/account-form";
import { SectionTabs } from "@/components/sales/tabs";
import { accountTabs } from "@/lib/sales/tabs";

export const metadata: Metadata = { title: "New account" };

export default async function NewAccountPage() {
  const access = await checkSection("accounts");
  if (!access.allowed || !["admin", "account_specialist"].includes(access.user.role)) return <NoAccess />;
  const db = await createClient();
  const [intermediaries, team, terms] = await Promise.all([loadIntermediaries(db), loadTeam(db), loadTerms(db)]);
  return (
    <div className="max-w-4xl">
      <PageHeader title="New account" description="Onboarding (SOP P1): code, invoicing route, payment, delivery set-up, team and the first contact." />
      <SectionTabs tabs={accountTabs(true)} />
      <AccountForm mode="new" intermediaries={intermediaries} team={team} isAdmin={access.user.role === "admin"} lastCodeSeq={terms.lastCodeSeq} />
    </div>
  );
}
