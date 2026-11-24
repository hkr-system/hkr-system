import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/brands";
import { todayIn } from "@/lib/format";
import { getEurUsd } from "./fx";
import { effectiveRate, parseD2D } from "./door-to-door";
import type { D2DChoices } from "./d2d-service";
import type { OutMeta, OutRow } from "./outputs";

type Db = Awaited<ReturnType<typeof createClient>>;

// Price list for LEADS (Gabriel, Nov 24 2026): base × (1 + lead_list_extra_pct %), no RMA amortization, no client name.
// Read through rpc lead_price_list (security definer): admin + bd; the base rows stay admin-only.
export async function loadLeadListDoc(db: Db, brand: Brand): Promise<{ rows: OutRow[]; meta: OutMeta; baseVersion: number } | { error: string }> {
  const { data, error } = await db.rpc("lead_price_list", { p_brand: brand });
  if (error) return { error: error.code === "42501" ? "You do not have access to the lead price list." : error.message };
  if (!data?.length) return { error: `No ${brand === "samsung" ? "Samsung" : "iPhone"} base list yet.` };
  return {
    baseVersion: data[0].base_version,
    rows: data.map((r) => ({ model: r.model, storage_gb: r.storage_gb, note: r.note, price_usd: Number(r.price_usd) })),
    meta: {
      title: `HK Refurbished Stock · ${brand === "samsung" ? "Samsung " : ""}Price list`,
      validFrom: todayIn("Asia/Hong_Kong"), validUntil: null, isBase: false,
    },
  };
}

/** Door-to-door choices for a lead list: every company with an active set-up (no client market to check). */
export async function loadLeadD2DChoices(db: Db): Promise<D2DChoices> {
  const [{ data: ims }, fx] = await Promise.all([db.from("intermediaries").select("id, name, d2d").order("name"), getEurUsd()]);
  const companies = (ims ?? []).flatMap((i) => {
    const c = parseD2D(i.d2d);
    return c?.enabled ? [{ id: i.id, name: i.name, spread: c.fx_spread, suggested: fx ? effectiveRate(fx.rate, c.fx_spread) : null }] : [];
  });
  return { eligible: true, companies, fx };
}

export const leadFileBase = (brand: Brand, date: string) => `HKR_PL${brand === "samsung" ? "-SAMSUNG" : ""}_${date}`;
