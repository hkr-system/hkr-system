import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { loadRows } from "@/lib/price-lists/service";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { BaseEditor } from "@/components/price-lists/base-editor";

export const metadata: Metadata = { title: "Base list" };

export default async function BaseListPage() {
  const access = await checkSection("price-lists");
  if (!access.allowed || access.user.role !== "admin") return <NoAccess />;
  const db = await createClient();
  const { data: base } = await db.from("price_lists").select("id").is("account_id", null).eq("status", "approved").maybeSingle();
  const rows = base ? await loadRows(db, base.id) : [];
  return (
    <>
      <PageHeader title="Base list" description="Admin only. Saving creates a new version; client lists prepared after that use it. Approved client lists keep the base they were built on.">
        <Link href="/price-lists" className="text-sm text-hkr-accent hover:underline">← Price lists</Link>
      </PageHeader>
      <BaseEditor current={rows} today={todayIn(access.user.timezone)} />
    </>
  );
}
