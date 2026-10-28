import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rmaTabs } from "@/lib/rmas/tabs";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { NewRmaForm } from "@/components/rmas/new-rma-form";

export const metadata: Metadata = { title: "New RMA" };

export default async function NewRmaPage({ searchParams }: PageProps<"/rmas/new">) {
  const access = await checkSection("rmas");
  if (!access.allowed) return <NoAccess />;
  const sp = await searchParams;
  const db = await createClient();
  const { data: accounts } = await db.from("accounts").select("id, code, name").neq("status", "closed").order("code");
  return (
    <>
      <PageHeader title="New RMA" description="Type the units, or import the client's RMA Request Form (xlsx). Clients with portal access can also send it themselves." />
      <SectionTabs tabs={rmaTabs(access.user.role)} />
      <NewRmaForm accounts={accounts ?? []} defaultAccount={typeof sp.account === "string" ? sp.account : undefined} />
    </>
  );
}
