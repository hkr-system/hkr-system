import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { money } from "@/lib/orders/constants";
import { APPLIED_TO_LABEL } from "@/lib/rmas/constants";
import { rmaTabs } from "@/lib/rmas/tabs";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { CnStatusBadge } from "@/components/rmas/badges";
import { StatTile } from "@/components/viz";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Credit notes" };

export default async function CreditNotesPage() {
  const access = await checkSection("rmas");
  if (!access.allowed) return <NoAccess />;
  const db = await createClient();
  const { data: rows } = await db.from("credit_notes")
    .select("id, number, status, amount, currency, invoice_no, applied_to, applied_invoice_no, issued_on, created_at, accounts(code, name), rmas(id, number)")
    .order("created_at", { ascending: false }).limit(500);
  const list = rows ?? [];
  const sum = (s: string[], cur: "USD" | "EUR") => list.filter((c) => s.includes(c.status) && c.currency === cur).reduce((t, c) => t + Number(c.amount), 0);

  return (
    <>
      <PageHeader title="Credit notes" description="SOP P10: prepared by the team, approved by the Sales Director (admin), issued to the client, then applied on an invoice.">
        <Button asChild size="sm"><Link href="/rmas/credit-notes/new">New credit note</Link></Button>
      </PageHeader>
      <SectionTabs tabs={rmaTabs(access.user.role)} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Drafts to approve" value={list.filter((c) => c.status === "draft").length} tone="attention" />
        <StatTile label="Approved, to issue" value={list.filter((c) => c.status === "approved").length} tone="attention" />
        <StatTile label="Issued, not applied (USD)" value={money(sum(["issued"], "USD"))} sub={sum(["issued"], "EUR") ? `+ ${money(sum(["issued"], "EUR"), "EUR")}` : undefined} />
        <StatTile label="Applied (USD)" value={money(sum(["applied"], "USD"))} />
      </div>
      <Card>
        <CardContent className="px-0">
          <Table data-testid="cn-table">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Credit note</TableHead><TableHead>Status</TableHead><TableHead>RMA</TableHead><TableHead>Invoice</TableHead>
                <TableHead>Applied to</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => {
                const acc = c.accounts as unknown as { code: string; name: string };
                const rma = c.rmas as unknown as { id: string; number: string } | null;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4"><Link href={`/rmas/credit-notes/${c.id}`} className="font-mono text-xs font-medium hover:underline">{c.number}</Link><span className="block text-xs text-muted-foreground">{acc.name}</span></TableCell>
                    <TableCell><CnStatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-xs">{rma ? <Link href={`/rmas/${rma.id}`} className="hover:underline">{rma.number}</Link> : "—"}</TableCell>
                    <TableCell className="text-xs">{c.invoice_no ?? "—"}</TableCell>
                    <TableCell className="text-xs">{APPLIED_TO_LABEL.en[c.applied_to]}{c.applied_invoice_no ? ` · ${c.applied_invoice_no}` : ""}</TableCell>
                    <TableCell className="text-right" data-tabular>{money(c.amount, c.currency)}</TableCell>
                    <TableCell className="text-xs">{formatDate(c.issued_on)}</TableCell>
                  </TableRow>
                );
              })}
              {!list.length ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No credit notes yet.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
