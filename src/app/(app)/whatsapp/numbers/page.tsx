import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { ImportNumbersButton, NumberByMarketForm, NumberEditRow, type NumberRow } from "@/components/whatsapp/admin-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Numbers · WhatsApp" };

export default async function NumbersPage() {
  const access = await checkSection("whatsapp");
  if (!access.allowed || access.user.role !== "admin") return <NoAccess />;
  const db = await createClient();
  const [{ data: numbers }, { data: setting }] = await Promise.all([
    db.from("wa_numbers").select("*").order("label"),
    db.from("settings").select("value").eq("key", "wa_number_by_market").maybeSingle(),
  ]);
  const live = (numbers ?? []).filter((n) => !n.is_demo);
  return (
    <>
      <PageHeader title="Numbers"
        description="Numbers appear here when Meta sends their first webhook, or with the import button. Quality is checked daily; a Low (RED) rating pauses broadcasts automatically.">
        <ImportNumbersButton />
      </PageHeader>
      <div className="grid gap-6">
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead className="pl-4">Number</TableHead><TableHead colSpan={2}>Settings</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(numbers ?? []).map((n) => <NumberEditRow key={n.id} n={n as NumberRow} />)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Number per market</CardTitle>
            <CardDescription>
              Which number writes to each market (automations, new chats from a lead). Decided Oct 2026: LATAM → the US number; EU and UK → the European numbers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NumberByMarketForm value={(setting?.value ?? {}) as Record<string, string | null>}
              numbers={live.map((n) => ({ id: n.id, label: `${n.label ?? "Number"} · ${n.display_phone}` }))} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
