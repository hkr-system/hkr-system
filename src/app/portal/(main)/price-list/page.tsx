import type { Metadata } from "next";
import { getPortalContext, portalDate, portalMoney } from "@/lib/portal/session";
import { groupRows } from "@/lib/price-lists/outputs";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: { absolute: "Price list · Client portal" } };

// The client's current APPROVED list (view portal_price_list: prices only, never the floor or percentages).
export default async function PortalPriceList() {
  const { db, t, lang } = await getPortalContext();
  const { data } = await db.from("portal_price_list").select("model, storage_gb, note, price_usd, valid_from, valid_until");
  const rows = (data ?? []).map((r) => ({ model: r.model!, storage_gb: r.storage_gb!, note: r.note, price_usd: Number(r.price_usd) }));
  const first = data?.[0];
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t.priceList}</h1>
      {!rows.length ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground" data-testid="price-list-soon">{t.priceListSoon}</CardContent></Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="price-list-valid">{t.priceListValid(portalDate(first?.valid_from, lang), portalDate(first?.valid_until, lang))}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {groupRows(rows).map((g) => (
              <Card key={g.label}>
                <CardContent className="py-4">
                  <p className="mb-2 font-medium">{g.label}</p>
                  {g.rows.map((r) => (
                    <div key={r.storage_gb} className="flex justify-between border-t py-1.5 text-sm first-of-type:border-t-0" data-tabular>
                      <span>{r.storage_gb} GB</span><span className="font-medium">{portalMoney(r.price_usd)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
