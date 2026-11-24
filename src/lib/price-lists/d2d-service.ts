import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { d2dNotes, d2dUnitPrice, effectiveRate, parseD2D, type D2DConfig } from "./door-to-door";
import { fmtDate, type OutMeta, type OutRow } from "./outputs";
import { getEurUsd, type FxRate } from "./fx";

type Db = Awaited<ReturnType<typeof createClient>>;
export type D2DChoice = { id: string; name: string; spread: number; suggested: number | null };
export type D2DChoices = { eligible: boolean; companies: D2DChoice[]; fx: FxRate | null };

/** For a client's price list: is it an EU client, which companies have a door-to-door set-up, and today's official rate. */
export async function loadD2DChoices(db: Db, accountId: string | null): Promise<D2DChoices> {
  if (!accountId) return { eligible: false, companies: [], fx: null };
  const { data: acc } = await db.from("accounts").select("market").eq("id", accountId).maybeSingle();
  if (acc?.market !== "EU") return { eligible: false, companies: [], fx: null };
  const [{ data: ims }, fx] = await Promise.all([db.from("intermediaries").select("id, name, d2d").order("name"), getEurUsd()]);
  const companies = (ims ?? []).flatMap((i) => {
    const c = parseD2D(i.d2d);
    return c?.enabled ? [{ id: i.id, name: i.name, spread: c.fx_spread, suggested: fx ? effectiveRate(fx.rate, c.fx_spread) : null }] : [];
  });
  return { eligible: true, companies, fx };
}

/** The same list in EUR, door to door via one company (its name is never put on the output). */
export async function d2dOutput(db: Db, viaId: string, rate: number, rows: OutRow[], meta: OutMeta)
  : Promise<{ rows: OutRow[]; meta: OutMeta; cfg: D2DConfig } | { error: string }> {
  if (!(rate > 0.5 && rate < 2)) return { error: "Write a valid EUR → USD rate (e.g. 1.1200)." };
  const { data: im } = await db.from("intermediaries").select("d2d").eq("id", viaId).maybeSingle();
  const cfg = parseD2D(im?.d2d);
  if (!cfg?.enabled) return { error: "That company has no door-to-door set-up (Settings → Intermediaries & clearance)." };
  const today = new Date().toISOString().slice(0, 10);
  return {
    cfg,
    // the previous price goes through the same conversion, so ▼ / ▲ show the change of the list, not of the rate
    rows: rows.map((r) => ({
      ...r, price_usd: d2dUnitPrice(Number(r.price_usd), cfg, rate),
      ...(r.prev_price === undefined ? {} : { prev_price: r.prev_price === null ? null : d2dUnitPrice(Number(r.prev_price), cfg, rate) }),
    })),
    meta: { ...meta, currency: "EUR", terms: "EUR · Door to door", notes: d2dNotes(cfg, rate, fmtDate(today)) },
  };
}
