import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { BroadcastForm } from "@/components/whatsapp/broadcast-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "New broadcast" };

export default async function NewBroadcastPage() {
  const access = await checkSection("whatsapp");
  if (!access.allowed || access.user.role === "account_specialist") return <NoAccess />;
  const db = await createClient();
  const [{ data: numbers }, { data: templates }] = await Promise.all([
    db.from("wa_numbers").select("id, label, display_phone").eq("active", true).eq("is_demo", false).order("label"),
    db.from("wa_templates").select("id, name, language, category, components").eq("status", "APPROVED").order("name"),
  ]);
  return (
    <>
      <PageHeader title="New broadcast" description="Saved as a draft. BD submits it for approval; only an admin can approve and send." />
      <Card>
        <CardContent>
          <BroadcastForm numbers={(numbers ?? []).map((n) => ({ id: n.id, label: `${n.label ?? "Number"} · ${n.display_phone}` }))}
            templates={(templates ?? []) as never} />
        </CardContent>
      </Card>
    </>
  );
}
