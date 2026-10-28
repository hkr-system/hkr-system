import type { Metadata } from "next";
import { getPortalContext } from "@/lib/portal/session";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: { absolute: "Price list · Client portal" } };

// Phase 6 (price-list engine) fills this page with the client's latest APPROVED list.
export default async function PortalPriceList() {
  const { t } = await getPortalContext();
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t.priceList}</h1>
      <Card><CardContent className="py-6 text-sm text-muted-foreground" data-testid="price-list-soon">{t.priceListSoon}</CardContent></Card>
    </div>
  );
}
