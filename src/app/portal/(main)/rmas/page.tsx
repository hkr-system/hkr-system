import type { Metadata } from "next";
import Link from "next/link";
import { getPortalContext, portalDate, portalMoney } from "@/lib/portal/session";
import { APPLIED_TO_LABEL, RMA_STATUS_HELP_EN, RMA_STATUS_HELP_ES, type RmaStatus } from "@/lib/rmas/constants";
import { CnStatusBadge, RmaStatusBadge } from "@/components/rmas/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: { absolute: "RMAs · Client portal" } };

// "Solved" = closed, or every unit settled (credited / returned / rejected).
const UNRESOLVED: RmaStatus[] = ["requested", "form_received", "verified", "approved", "awaiting_return", "in_batch", "received_hk"];

export default async function PortalRmas() {
  const { db, t, lang } = await getPortalContext();
  const [{ data: rmas }, { data: cns }] = await Promise.all([
    db.from("portal_rmas").select("*").order("created_at", { ascending: false }),
    db.from("portal_credit_notes").select("*").order("issued_on", { ascending: false }),
  ]);
  const help = lang === "es" ? RMA_STATUS_HELP_ES : RMA_STATUS_HELP_EN;
  const open = (rmas ?? []).filter((r) => r.status !== "closed");
  const history = (rmas ?? []).filter((r) => r.status === "closed");
  const rowsTable = (list: typeof open, testId: string) => (
    <Table data-testid={testId}>
      <TableHeader>
        <TableRow><TableHead className="pl-4">{t.rma}</TableHead><TableHead>{t.status}</TableHead><TableHead className="text-right">{t.units}</TableHead><TableHead>{t.submitted}</TableHead><TableHead className="text-right">{t.credit}</TableHead><TableHead className="pr-4" /></TableRow>
      </TableHeader>
      <TableBody>
        {list.map((r) => {
          const unresolved = UNRESOLVED.includes(r.status as RmaStatus);
          return (
            <TableRow key={r.id}>
              <TableCell className="pl-4"><Link href={`/portal/rmas/${r.id}`} className="font-mono text-xs font-medium underline">{r.number}</Link></TableCell>
              <TableCell><RmaStatusBadge status={r.status as RmaStatus} lang={lang} /><span className="block max-w-80 text-xs whitespace-normal text-muted-foreground">{r.status === "requested" && r.units_without_evidence ? t.missingEvidence : help[r.status as RmaStatus]}</span></TableCell>
              <TableCell className="text-right" data-tabular>{r.units}</TableCell>
              <TableCell className="text-xs">{portalDate(r.submitted_at ?? r.created_at, lang)}</TableCell>
              <TableCell className="text-right" data-tabular>{r.credit_usd !== null && Number(r.credit_usd) > 0 ? portalMoney(r.credit_usd) : "—"}</TableCell>
              <TableCell className="pr-4 text-right text-xs">{unresolved ? <span className="text-amber-800">{t.rmaUnresolved}</span> : null}</TableCell>
            </TableRow>
          );
        })}
        {!list.length ? <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{t.noRmas}</TableCell></TableRow> : null}
      </TableBody>
    </Table>
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t.rmas}</h1>
        <Button asChild><Link href="/portal/rmas/new">{t.newRma}</Link></Button>
      </div>
      <Card><CardHeader><CardTitle>{t.rmaPending}</CardTitle></CardHeader><CardContent className="px-0">{rowsTable(open, "portal-rmas-open")}</CardContent></Card>
      <Card>
        <CardHeader><CardTitle>{lang === "es" ? "Notas de crédito" : "Credit notes"}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm" data-testid="portal-cns">
          {(cns ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs">{c.number}</span><CnStatusBadge status={c.status} lang={lang} />
              <span data-tabular>{portalMoney(c.amount, c.currency)}</span>
              <span className="text-xs text-muted-foreground">{c.rma_number ?? "—"} · {APPLIED_TO_LABEL[lang][c.applied_to]}{c.applied_invoice_no ? ` ${c.applied_invoice_no}` : ""} · {portalDate(c.issued_on, lang)}</span>
              {c.pdf_file_id ? <a className="text-xs underline" href={`/api/portal/files/${c.pdf_file_id}`} target="_blank" rel="noreferrer">PDF</a> : null}
            </div>
          ))}
          {!cns?.length ? <p className="text-muted-foreground">—</p> : null}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>{t.rmaHistory}</CardTitle></CardHeader><CardContent className="px-0">{rowsTable(history, "portal-rmas-history")}</CardContent></Card>
    </div>
  );
}
