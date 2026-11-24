import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadLeadD2DChoices } from "@/lib/price-lists/lead-list";
import { fmtDate } from "@/lib/price-lists/outputs";
import type { BaseRow } from "@/lib/whatsapp/offer";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { OfferBuilder } from "@/components/whatsapp/offer-builder";

export const metadata: Metadata = { title: "Offers · WhatsApp" };

// WhatsApp → Offers (Gabriel, Nov 24 2026): "Special Volume Deal" text from the current base list (no extra margin), the
// models that dropped most vs the previous base first. Admin + bd with the WhatsApp module. Nothing is sent from here: copy it.
export default async function OffersPage() {
  const access = await checkSection("whatsapp");
  if (!access.allowed) return <NoAccess />;
  if (access.user.role !== "admin" && access.user.role !== "bd") return <NoAccess />;
  const db = await createClient();
  const [{ data, error }, d2d] = await Promise.all([db.rpc("offer_base_prices", { p_brand: "iphone" }), loadLeadD2DChoices(db)]);
  const rows: BaseRow[] = (data ?? []).map((r) => ({
    model: r.model, storage_gb: r.storage_gb, note: r.note, price_usd: Number(r.price_usd),
    prev_price_usd: r.prev_price_usd === null ? null : Number(r.prev_price_usd),
  }));
  const head = data?.[0];
  const basis = !head ? "No iPhone base list yet." : `Base v${head.base_version} (from ${fmtDate(head.valid_from)})${head.prev_version ? ` compared with v${head.prev_version}` : " — no previous base to compare with"}.`;
  return (
    <>
      <PageHeader title="Offers"
        description={`Special Volume Deal for broadcasts: base prices with no extra margin; the models that dropped most are picked first. ${basis}`} />
      {error ? <p className="text-sm text-destructive">{error.message}</p> : <OfferBuilder rows={rows} d2d={d2d} />}
    </>
  );
}
