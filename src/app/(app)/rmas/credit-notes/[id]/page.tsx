import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { loadTeam } from "@/lib/leads/service";
import { rmaTabs } from "@/lib/rmas/tabs";
import { NoAccess } from "@/components/no-access";
import { SectionTabs } from "@/components/sales/tabs";
import { CnStatusBadge } from "@/components/rmas/badges";
import { CnStatusControls, CreditNoteEditor } from "@/components/rmas/credit-note-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Credit note" };

export default async function CreditNotePage({ params }: PageProps<"/rmas/credit-notes/[id]">) {
  const access = await checkSection("rmas");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const isAdmin = user.role === "admin";
  const { id } = await params;
  const db = await createClient();
  const { data: c } = await db.from("credit_notes").select("*, credit_note_lines(description, qty, unit_price, sort_order), rmas(id, number)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: accounts }, { data: orders }, team] = await Promise.all([
    db.from("accounts").select("id, code, name, legal_name").eq("id", c.account_id),
    db.from("orders").select("id, account_id, number, hk_invoice_no, total_usd").eq("account_id", c.account_id).neq("status", "quoted").order("order_date", { ascending: false }),
    loadTeam(db),
  ]);
  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));
  const acc = (accounts ?? [])[0];
  const rma = c.rmas as unknown as { id: string; number: string } | null;
  const lines = ((c.credit_note_lines ?? []) as { description: string; qty: number; unit_price: number; sort_order: number }[]).sort((a, b) => a.sort_order - b.sort_order);
  const editable = c.status === "draft" || isAdmin;

  return (
    <>
      <div className="mb-4">
        <Link href="/rmas/credit-notes" className="text-sm text-muted-foreground hover:underline">← Credit notes</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="page-title"><span className="font-mono">{c.number}</span></h1>
          <CnStatusBadge status={c.status} />
          {acc ? <Link href={`/accounts/${acc.id}?tab=rmas`} className="text-sm text-muted-foreground hover:underline">{acc.code} · {acc.name}</Link> : null}
          {rma ? <Link href={`/rmas/${rma.id}`} className="text-sm text-muted-foreground hover:underline">{rma.number}</Link> : null}
          <div className="ml-auto flex gap-2">
            <Button asChild size="sm" variant="outline"><a href={`/api/credit-notes/${id}/pdf`} target="_blank" rel="noreferrer" data-testid="cn-pdf">PDF</a></Button>
            <Button asChild size="sm" variant="outline"><a href={`/api/credit-notes/${id}/xlsx`} data-testid="cn-xlsx">xlsx</a></Button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {c.approved_at ? `Approved ${formatDateTime(c.approved_at, user.timezone)} by ${names.get(c.approved_by ?? "") ?? "admin"} · ` : ""}
          {c.issued_on ? `date of issue ${formatDate(c.issued_on)} · ` : ""}
          {c.applied_on ? `applied ${formatDate(c.applied_on)} on ${c.applied_invoice_no ?? "—"}` : ""}
        </p>
      </div>
      <SectionTabs tabs={rmaTabs(user.role)} />

      <Card className="mb-4 border-hkr-accent/40">
        <CardContent className="grid gap-2 py-4">
          <p className="text-xs text-muted-foreground uppercase">Next action</p>
          <p className="text-sm font-medium">
            {c.status === "draft" ? "Check the lines against what the Sales Director agreed; the SD approves before anything goes to the client."
              : c.status === "approved" ? "Issue it: the PDF and xlsx are saved in the account files and the client sees it in the portal. Send the PDF in the client group."
              : c.status === "issued" ? "When the next invoice carries the line “Credit note … applied”, mark it Applied with that invoice number."
              : c.status === "applied" ? "Nothing to do." : "Cancelled."}
          </p>
          <CnStatusControls id={id} status={c.status} isAdmin={isAdmin} hasFiles={Boolean(c.pdf_file_id)} />
          {c.pdf_file_id ? (
            <p className="text-xs">Saved files: <a className="underline" href={`/api/files/${c.pdf_file_id}`} target="_blank" rel="noreferrer">PDF</a>{c.xlsx_file_id ? <> · <a className="underline" href={`/api/files/${c.xlsx_file_id}`}>xlsx</a></> : null}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Credit note</CardTitle></CardHeader>
        <CardContent>
          <CreditNoteEditor editable={editable} accounts={accounts ?? []} orders={(orders ?? []).map((o) => ({ ...o, total_usd: Number(o.total_usd) }))}
            value={{ id, accountId: c.account_id, rmaId: c.rma_id, orderId: c.order_id, invoiceNo: c.invoice_no ?? "", inFavorOf: c.in_favor_of ?? "",
              currency: c.currency, reason: c.reason ?? "", appliedTo: c.applied_to, notes: c.notes ?? "",
              lines: lines.map((l) => ({ description: l.description, qty: Number(l.qty), unit_price: Number(l.unit_price) })) }} />
        </CardContent>
      </Card>
    </>
  );
}
