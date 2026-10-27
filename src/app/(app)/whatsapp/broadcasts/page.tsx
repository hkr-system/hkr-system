import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { BROADCAST_STATUS_LABEL as STATUS_LABEL } from "@/lib/whatsapp/labels";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Broadcasts · WhatsApp" };


export default async function BroadcastsPage() {
  const access = await checkSection("whatsapp");
  if (!access.allowed || access.user.role === "account_specialist") return <NoAccess />;
  const db = await createClient();
  const { data } = await db.from("wa_broadcasts")
    .select("id, name, status, scheduled_at, count_queued, count_sent, count_delivered, count_read, count_failed, count_skipped, created_at, wa_numbers(label, display_phone), wa_templates(name)")
    .order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader title="Broadcasts" description="Template messages to a segment of opted-in leads. BD prepares, admin approves; sending is spread to respect each number's daily limit.">
        <Button asChild size="sm"><Link href="/whatsapp/broadcasts/new">New broadcast</Link></Button>
      </PageHeader>
      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead><TableHead>Status</TableHead><TableHead>Template</TableHead><TableHead>From</TableHead>
                <TableHead className="text-right">Queued</TableHead><TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Read</TableHead>
                <TableHead className="text-right">Failed</TableHead><TableHead>Scheduled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((b) => {
                const n = Array.isArray(b.wa_numbers) ? b.wa_numbers[0] : b.wa_numbers;
                const t = Array.isArray(b.wa_templates) ? b.wa_templates[0] : b.wa_templates;
                return (
                  <TableRow key={b.id}>
                    <TableCell className="pl-4 font-medium"><Link className="hover:underline" href={`/whatsapp/broadcasts/${b.id}`}>{b.name}</Link></TableCell>
                    <TableCell><Badge variant="outline">{STATUS_LABEL[b.status] ?? b.status}</Badge></TableCell>
                    <TableCell className="text-xs">{t?.name}</TableCell>
                    <TableCell className="text-xs">{n?.label ?? n?.display_phone}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.count_queued}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.count_sent}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.count_delivered}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.count_read}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.count_failed}</TableCell>
                    <TableCell className="text-xs">{b.scheduled_at ? formatDateTime(b.scheduled_at, access.user.timezone) : "—"}</TableCell>
                  </TableRow>
                );
              })}
              {!data?.length ? <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">No broadcasts yet.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
