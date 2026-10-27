import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadTeam } from "@/lib/leads/service";
import { formatDateTime } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { Importer } from "@/components/leads/importer";
import { UndoImportButton } from "@/components/leads/undo-import-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Import · Leads" };

export default async function ImportPage() {
  const access = await checkSection("leads");
  if (!access.allowed || access.readOnly) return <NoAccess />;
  const db = await createClient();
  const [{ data: batches }, team] = await Promise.all([
    db.from("lead_import_batches").select("*").order("created_at", { ascending: false }).limit(20),
    loadTeam(db),
  ]);
  const names = new Map(team.map((t) => [t.user_id, t.full_name]));
  const suggestions = ["Leads NL", "IFA master list", "LinkedIn EU"];

  return (
    <>
      <PageHeader title="Import leads"
        description="Upload a list, match its columns, check the preview, then import. Duplicates are matched by email and phone." />
      <div className="grid gap-6">
        <Card><CardContent><Importer suggestions={suggestions} /></CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Recent imports</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead><TableHead>Source</TableHead><TableHead>File</TableHead>
                  <TableHead className="text-right">Created</TableHead><TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Skipped</TableHead><TableHead>By</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(batches ?? []).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{formatDateTime(b.created_at, access.user.timezone)}</TableCell>
                    <TableCell className="font-medium">{b.source}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.file_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.rows_created}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.rows_merged}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.rows_skipped}</TableCell>
                    <TableCell>{b.created_by ? names.get(b.created_by) ?? "—" : "—"}</TableCell>
                    <TableCell className="text-right">
                      {b.undone_at ? <span className="text-xs text-muted-foreground">Undone</span> : <UndoImportButton id={b.id} source={b.source} />}
                    </TableCell>
                  </TableRow>
                ))}
                {!batches?.length ? <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No imports yet.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
