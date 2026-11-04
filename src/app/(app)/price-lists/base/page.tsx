import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { BRAND_LABEL, isBrand, type Brand } from "@/lib/brands";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import { loadRows } from "@/lib/price-lists/service";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { BaseEditor } from "@/components/price-lists/base-editor";
import { EditLock } from "@/components/edit-lock";

export const metadata: Metadata = { title: "Base list" };

export default async function BaseListPage({ searchParams }: PageProps<"/price-lists/base">) {
  const sp = await searchParams;
  const brand: Brand = isBrand(sp.brand) ? sp.brand : "iphone";
  const access = await checkSection("price-lists");
  if (!access.allowed || access.user.role !== "admin") return <NoAccess />;
  const db = await createClient();
  const { data: base } = await db.from("price_lists").select("id").is("account_id", null).eq("brand", brand).eq("status", "approved").maybeSingle();
  const rows = base ? await loadRows(db, base.id) : [];
  return (
    <>
      <PageHeader title={`${BRAND_LABEL[brand]} base list`} description="Admin only. Saving creates a new version; client lists prepared after that use it. Approved client lists keep the base they were built on.">
        <Link href="/price-lists" className="text-sm text-hkr-accent hover:underline">← Price lists</Link>
      </PageHeader>
      <EditLock label="Edit base list" bar="top"><BaseEditor key={brand} brand={brand} current={rows} today={todayIn(access.user.timezone)} /></EditLock>
    </>
  );
}
