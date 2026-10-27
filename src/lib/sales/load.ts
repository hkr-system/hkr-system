import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { addDays, type Grain } from "./series";

type DB = SupabaseClient<Database>;

export function periodRange(period: string, today: string) {
  if (period === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today, days: 0 };
  const days = Math.max(1, Number(period) || 90);
  return { from: addDays(today, -(days - 1)), to: today, days };
}

export function grainFor(raw: string | undefined, period: string): Grain {
  if (raw === "day" || raw === "week" || raw === "month") return raw;
  return period === "30" ? "day" : period === "90" ? "week" : "month";
}

export type SaleOrder = {
  order_id: string; account_id: string; number: string; order_date: string; status: string;
  total_usd: number; pieces: number; rma_discount_usd: number; margin_usd: number | null;
};

export async function loadSales(db: DB, from: string, to: string): Promise<SaleOrder[]> {
  const { data } = await db.rpc("sales_orders", { p_from: from, p_to: to });
  return (data ?? []).map((r) => ({ ...r, total_usd: Number(r.total_usd), rma_discount_usd: Number(r.rma_discount_usd), margin_usd: r.margin_usd === null ? null : Number(r.margin_usd) }));
}
