import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { bodyText, headerFormat } from "@/lib/whatsapp/templates";
import { formatDateTime } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SyncTemplatesButton } from "@/components/whatsapp/admin-buttons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Templates · WhatsApp" };

export default async function TemplatesPage() {
  const access = await checkSection("whatsapp");
  if (!access.allowed) return <NoAccess />;
  const db = await createClient();
  const { data: templates } = await db.from("wa_templates").select("*").order("name").order("language");
  return (
    <>
      <PageHeader title="Templates"
        description="Templates are created and approved in Meta Business Manager; here they are read-only. Outside the 24-hour window only APPROVED templates can be sent.">
        {access.user.role === "admin" ? <SyncTemplatesButton /> : null}
      </PageHeader>
      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead><TableHead>Language</TableHead><TableHead>Category</TableHead>
                <TableHead>Status</TableHead><TableHead>Text</TableHead><TableHead>Synced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(templates ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-4 font-medium">{t.name}</TableCell>
                  <TableCell>{t.language}</TableCell>
                  <TableCell className="text-xs">{t.category}</TableCell>
                  <TableCell>
                    <Badge variant={t.status === "APPROVED" ? "secondary" : "outline"}
                      className={t.status === "APPROVED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : ""}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md text-xs whitespace-normal text-muted-foreground">
                    {headerFormat(t.components) && headerFormat(t.components) !== "TEXT" ? <Badge variant="outline" className="mr-1">{headerFormat(t.components)?.toLowerCase()} header</Badge> : null}
                    {bodyText(t.components)}
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(t.synced_at, access.user.timezone)}</TableCell>
                </TableRow>
              ))}
              {!templates?.length ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No templates yet. The admin clicks “Sync from Meta”.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
