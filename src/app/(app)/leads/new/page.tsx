import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countryOptions } from "@/lib/leads/countries";
import { loadTeam } from "@/lib/leads/service";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { LeadForm } from "@/components/leads/lead-form";
import { Card, CardContent } from "@/components/ui/card";
import { createLead } from "../actions";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const access = await checkSection("leads");
  if (!access.allowed || access.readOnly) return <NoAccess />;
  const team = (await loadTeam(await createClient())).filter((t) => t.role !== "account_specialist" && t.user_id !== access.user.id);
  return (
    <>
      <PageHeader title="New lead" description="Score and tier are calculated from the scoring rules when you save." />
      <Card>
        <CardContent>
          <LeadForm action={createLead} countries={countryOptions()} team={team} submitLabel="Create lead" />
        </CardContent>
      </Card>
    </>
  );
}
