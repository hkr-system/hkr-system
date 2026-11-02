import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { compareRows, modelKey } from "./models";
import { paramsFromSettings, type EngineParams } from "./engine";

type DB = SupabaseClient<Database>;

/** Engine parameters: admin and specialist (security definer RPC; the settings rows stay admin-only). */
export async function loadEngineParams(db: DB): Promise<EngineParams & { refreshDays: number }> {
  const { data } = await db.rpc("price_engine_params");
  const obj = (data ?? {}) as Record<string, unknown>;
  const rows = Object.entries(obj).map(([key, value]) => ({ key, value }));
  const refresh = Number(obj.engine_refresh_days);
  return { ...paramsFromSettings(rows), refreshDays: Number.isFinite(refresh) && refresh > 0 ? refresh : 14 };
}

/** Rows of one list, in catalogue order. */
export async function loadRows(db: DB, listId: string) {
  const { data } = await db.from("price_list_rows").select("id, model, storage_gb, note, price_usd, floor_usd, sort_order").eq("price_list_id", listId);
  return (data ?? []).map((r) => ({ ...r, price_usd: Number(r.price_usd), floor_usd: r.floor_usd === null ? null : Number(r.floor_usd) })).sort(compareRows);
}

/** Approved client prices per account → { "<model>|<gb>": row } (order form). */
export async function loadApprovedPrices(db: DB) {
  const { data } = await db.from("price_list_rows")
    .select("id, account_id, model, storage_gb, price_usd, floor_usd, price_lists!inner(status, version, valid_until)")
    .eq("price_lists.status", "approved").not("account_id", "is", null).limit(5000);
  const out: Record<string, { version: number; validUntil: string | null; rows: Record<string, { id: string; price: number; floor: number | null }> }> = {};
  for (const r of data ?? []) {
    const l = r.price_lists as unknown as { version: number; valid_until: string | null };
    const acc = (out[r.account_id!] ??= { version: l.version, validUntil: l.valid_until, rows: {} });
    acc.rows[modelKey(r.model, r.storage_gb)] = { id: r.id, price: Number(r.price_usd), floor: r.floor_usd === null ? null : Number(r.floor_usd) };
  }
  return out;
}


/** What the outputs need (price only: never floors or percentages). RLS decides who can load which list. */
export async function loadListDoc(db: DB, id: string) {
  const { data: l } = await db.from("price_lists").select("id, account_id, version, status, valid_from, valid_until, accounts(code, name)").eq("id", id).maybeSingle();
  if (!l) return null;
  const acc = l.accounts as unknown as { code: string; name: string } | null;
  const rows = (await loadRows(db, id)).map((r) => ({ model: r.model, storage_gb: r.storage_gb, note: r.note, price_usd: r.price_usd }));
  const isBase = !l.account_id;
  const title = isBase ? `Base price list v${l.version} (internal — admin only)`
    : `HK Refurbished Stock · Price list ${acc?.name ?? ""}`.trim() + (l.status === "draft" ? " (DRAFT)" : "");
  return { list: l, code: acc?.code ?? null, rows, meta: { title, validFrom: l.valid_from, validUntil: l.valid_until, isBase } };
}

/** HKR logo for the PDF (traced into the functions by next.config outputFileTracingIncludes). */
export async function loadLogo(): Promise<Buffer | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    return await readFile(path.join(process.cwd(), "public", "brand", "logo.png"));
  } catch { return null; }
}
