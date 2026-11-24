"use server";

import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { d2dUnitPrice, parseD2D } from "@/lib/price-lists/door-to-door";
import { offerKey } from "@/lib/whatsapp/offer";

// EU offer: every base price (no margin) converted door to door in EUR via the chosen company at the rate (Nov 24 2026).
export async function offerEurPrices(viaId: string, rate: number): Promise<{ prices?: Record<string, number>; error?: string }> {
  await requireSection("whatsapp", ["admin", "bd"]);
  if (!(rate > 0.5 && rate < 2)) return { error: "Write a valid EUR → USD rate (e.g. 1.1200)." };
  if (!/^[0-9a-f-]{36}$/.test(viaId)) return { error: "Choose the route." };
  const db = await createClient();
  const [{ data: rows, error }, { data: im }] = await Promise.all([
    db.rpc("offer_base_prices", { p_brand: "iphone" }),
    db.from("intermediaries").select("d2d").eq("id", viaId).maybeSingle(),
  ]);
  if (error) return { error: error.message };
  const cfg = parseD2D(im?.d2d);
  if (!cfg?.enabled) return { error: "That company has no door-to-door set-up (Settings → Intermediaries & clearance)." };
  return { prices: Object.fromEntries((rows ?? []).map((r) => [offerKey(r), d2dUnitPrice(Number(r.price_usd), cfg, rate)])) };
}
