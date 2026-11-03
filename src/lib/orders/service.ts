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
  const [{ data: accs }, { data: counts }, { data: contacts }] = await Promise.all([
    db.from("accounts").select("id, code, name, payment_method, delivery_setup, intermediary_id, invoice_format, country, legal_name, billing_address, status")
      .neq("status", "closed").order("code"),
    db.from("orders").select("account_id, ship_to, created_at").order("created_at", { ascending: false }).limit(5000),
    db.from("contacts").select("account_id, name, phone_e164, created_at").not("account_id", "is", null).order("created_at").limit(5000),
  ]);
  const n = new Map<string, number>();
  const lastShip = new Map<string, Record<string, string>>();
  for (const o of counts ?? []) {
    n.set(o.account_id, (n.get(o.account_id) ?? 0) + 1);
    const st = (o.ship_to ?? {}) as Record<string, string>;
    if (!lastShip.has(o.account_id) && (st.address || st.city)) lastShip.set(o.account_id, st);   // newest first
  }
  const firstContact = new Map<string, { name: string; phone: string | null }>();
  for (const c of contacts ?? []) if (c.account_id && !firstContact.has(c.account_id)) firstContact.set(c.account_id, { name: c.name, phone: c.phone_e164 });
  return (accs ?? []).map((a) => ({
    id: a.id, code: a.code, name: a.name, payment_method: a.payment_method, delivery_setup: a.delivery_setup,
    has_intermediary: Boolean(a.intermediary_id), country: a.country, legal_name: a.legal_name,
    battery_line_separate: Boolean((a.invoice_format as { battery_line_separate?: boolean } | null)?.battery_line_separate ?? true),
    ce_default: Boolean((a.invoice_format as { show_ce_text?: boolean } | null)?.show_ce_text),
    // the account's default invoice format; each order carries its own copy (Gabriel, Nov 3 2026)
    invoice_format: normalizeFormat(a.invoice_format),
    // Ship-to pre-filled (Gabriel, Nov 2 2026): the last order's delivery address; for a first order the account's own data
    ship_default: lastShip.get(a.id) ?? (() => {
      const lines = String(a.billing_address ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const c = firstContact.get(a.id);
      return { name: a.legal_name || a.name, address: lines.slice(0, Math.max(1, lines.length - 1)).join(", "), city: lines.length > 1 ? lines[lines.length - 1] : "",
        country: a.country ?? "", contact: c?.name ?? "", phone: c?.phone ?? "" };
    })(),
    orders: n.get(a.id) ?? 0,
  }));
}

export type InvoiceFormat = { battery_line_separate: boolean; show_ce_text: boolean; plain_lines: boolean; show_note: boolean };
/** Invoice format with every option set (separate battery line on by default, the rest off). */
export function normalizeFormat(f: unknown): InvoiceFormat {
  const x = (f ?? {}) as Partial<InvoiceFormat>;
  return { battery_line_separate: x.battery_line_separate ?? true, show_ce_text: Boolean(x.show_ce_text), plain_lines: Boolean(x.plain_lines), show_note: Boolean(x.show_note) };
}
