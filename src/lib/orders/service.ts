import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

export async function loadTerms(db: DB) {
  const { data } = await db.from("settings").select("key, value")
    .in("key", ["deposit_pct", "usdt_fee_pct", "moq_usd", "sample_order_min_usd", "account_code_last_seq"]);
  const v = (k: string, d: number) => Number(data?.find((r) => r.key === k)?.value ?? d);
  return {
    depositPct: v("deposit_pct", 10),
    usdtFeePct: v("usdt_fee_pct", 0.85),
    moqUsd: v("moq_usd", 20000),
    sampleMinUsd: v("sample_order_min_usd", 10000),
    lastCodeSeq: v("account_code_last_seq", 0),
  };
}

export async function loadIntermediaries(db: DB) {
  const { data } = await db.from("intermediaries").select("id, name").order("name");
  return data ?? [];
}

export async function loadSkus(db: DB) {
  const { data } = await db.from("skus").select("id, model, storage_gb, color, grade, battery_eligible")
    .order("model").order("storage_gb").order("color");
  return (data ?? []).map((s) => ({ ...s, label: `${s.model} ${s.storage_gb}GB ${s.color}${s.grade !== "A+++" ? ` (${s.grade})` : ""}` }));
}

// owner / specialist per account (account_assignments is the only source — decided Oct 27 2026)
export async function loadAssignments(db: DB, accountIds?: string[]) {
  let q = db.from("account_assignments").select("account_id, user_id, role_on_account");
  if (accountIds?.length) q = q.in("account_id", accountIds);
  const { data } = await q;
  const map = new Map<string, { owner: string | null; specialist: string | null }>();
  for (const r of data ?? []) {
    const cur = map.get(r.account_id) ?? { owner: null, specialist: null };
    if (r.role_on_account === "owner") cur.owner = r.user_id;
    else cur.specialist = r.user_id;
    map.set(r.account_id, cur);
  }
  return map;
}

export function skuLabel(s: { model: string; storage_gb: number; color: string } | null | undefined) {
  return s ? `${s.model} ${s.storage_gb}GB ${s.color}` : "";
}

// Accounts the user can order for, with what the order form needs.
export async function loadFormAccounts(db: DB) {
  const [{ data: accs }, { data: counts }] = await Promise.all([
    db.from("accounts").select("id, code, name, payment_method, delivery_setup, intermediary_id, invoice_format, country, legal_name, status")
      .neq("status", "closed").order("code"),
    db.from("orders").select("account_id"),
  ]);
  const n = new Map<string, number>();
  for (const o of counts ?? []) n.set(o.account_id, (n.get(o.account_id) ?? 0) + 1);
  return (accs ?? []).map((a) => ({
    id: a.id, code: a.code, name: a.name, payment_method: a.payment_method, delivery_setup: a.delivery_setup,
    has_intermediary: Boolean(a.intermediary_id), country: a.country, legal_name: a.legal_name,
    battery_line_separate: Boolean((a.invoice_format as { battery_line_separate?: boolean } | null)?.battery_line_separate ?? true),
    orders: n.get(a.id) ?? 0,
  }));
}
