import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rmaTabs } from "@/lib/rmas/tabs";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { CreditNoteEditor } from "@/components/rmas/credit-note-editor";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "New credit note" };

// A credit note not linked to an RMA (units not shipped, compensation — SOP P10). RMA credits
// are prepared from the RMA page ("Prepare credit note").
export default async function NewCreditNotePage({ searchParams }: PageProps<"/rmas/credit-notes/new">) {
  const access = await checkSection("rmas");
  if (!access.allowed) return <NoAccess />;
  const sp = await searchParams;
  const db = await createClient();
  const [{ data: accounts }, { data: orders }] = await Promise.all([
    db.from("accounts").select("id, code, name, legal_name").neq("status", "closed").order("code"),
    db.from("orders").select("id, account_id, number, hk_invoice_no, total_usd").neq("status", "quoted").order("order_date", { ascending: false }).limit(2000),
  ]);
  const account = typeof sp.account === "string" ? sp.account : "";
  const a = (accounts ?? []).find((x) => x.id === account);
  return (
    <>
      <PageHeader title="New credit note" description="For credits not linked to an RMA (units not shipped, compensation). RMA credits start from the RMA page." />
      <SectionTabs tabs={rmaTabs(access.user.role)} />
      <Card>
        <CardContent className="py-4">
          <CreditNoteEditor editable accounts={accounts ?? []} orders={(orders ?? []).map((o) => ({ ...o, total_usd: Number(o.total_usd) }))}
            value={{ id: null, accountId: account, rmaId: null, orderId: null, invoiceNo: "", inFavorOf: a?.legal_name ?? a?.name ?? "",
              currency: "USD", reason: "", appliedTo: "next_invoice", notes: "", lines: [] }} />
        </CardContent>
      </Card>
    </>
  );
}
