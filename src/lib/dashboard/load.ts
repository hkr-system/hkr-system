import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { todayIn } from "@/lib/format";
import { DEFAULT_CUTOFF, nextCutoff, type CutoffSetting } from "@/lib/rmas/cutoff";
import { addDays, weekStart } from "./dates";
import type { ReportOrder, ReportRma } from "./report";
import type { AlertOrder, AlertRma } from "./alerts";
import type { UpdateOrder, UpdateRma } from "./updates";

type DB = SupabaseClient<Database>;
export const HK = "Asia/Hong_Kong";

export type OpsOrder = ReportOrder & AlertOrder & UpdateOrder & { account_id: string; account_name: string };
export type OpsRma = ReportRma & AlertRma & UpdateRma & { account_id: string };
export type OpsAccount = { id: string; code: string; name: string; language: "en" | "es"; status: string; intermediary_id: string | null; market: string };

/** Everything the dashboard, the daily report and the queues read, in one round of parallel queries (RLS applies:
 *  a bd sees her accounts only). Dates are Hong Kong dates; the week starts on Monday. */
export async function loadOps(db: DB, now = new Date()) {
  const today = todayIn(HK);
  const week = weekStart(today);
  const [ov, orders, events, reminders, rmas, units, accounts, cutoffSetting, intermediaries] = await Promise.all([
    db.from("order_overview").select("id, account_id, account_code, account_name, number, status, order_date, pieces, total_usd, eta_date, payable_total, deposit_payable, deposit_confirmed, balance_confirmed, payment_awaiting, balance_ok, imei_count, label_ok, delivery_setup")
      .in("status", ["invoiced", "deposit_paid", "in_preparation", "ready_to_ship", "balance_paid", "shipped"]).limit(3000),
    db.from("orders").select("id, tracking, hk_invoice_no").in("status", ["invoiced", "deposit_paid", "in_preparation", "ready_to_ship", "balance_paid", "shipped"]).limit(3000),
    db.from("order_events").select("order_id, created_at").eq("kind", "status").gte("created_at", addDays(today, -400)).order("created_at", { ascending: false }).limit(10000),
    db.from("client_updates").select("id, account_id, kind, week_start, order_ids, sent_at, created_by").gte("sent_at", `${addDays(today, -120)}T00:00:00Z`).order("sent_at").limit(5000),
    db.from("rma_overview").select("id, account_id, account_code, account_name, number, status, created_at, closed_at, units, units_without_evidence, units_to_batch, intermediary_id")
      .or(`status.neq.closed,closed_at.gte.${addDays(today, -2)}T00:00:00Z`).limit(2000),
    db.from("rma_units").select("rma_id, resolution, credit_usd, batch_id, rma_batches(cutoff_date, status)").limit(10000),
    db.from("accounts").select("id, code, name, language, status, intermediary_id, market").neq("status", "closed").order("code").limit(2000),
    db.from("settings").select("value").eq("key", "batch_cutoff").maybeSingle(),
    db.from("intermediaries").select("id, name").order("name"),
  ]);

  const since = new Map<string, string>();
  for (const e of events.data ?? []) if (!since.has(e.order_id)) since.set(e.order_id, todayFromIso(e.created_at));
  const extra = new Map((orders.data ?? []).map((o) => [o.id, o]));
  const balanceReminders = new Map<string, string[]>();
  for (const u of reminders.data ?? []) if (u.kind === "balance_reminder")
    for (const id of u.order_ids ?? []) balanceReminders.set(id, [...(balanceReminders.get(id) ?? []), todayFromIso(u.sent_at)]);

  const opsOrders: OpsOrder[] = (ov.data ?? []).map((o) => ({
    id: o.id!, account_id: o.account_id!, account_code: o.account_code!, account_name: o.account_name!, number: o.number!, status: o.status!,
    order_date: o.order_date!, since: since.get(o.id!) ?? null, pieces: o.pieces ?? 0, eta_date: o.eta_date,
    payable_total: Number(o.payable_total), deposit_payable: Number(o.deposit_payable), deposit_confirmed: Number(o.deposit_confirmed),
    balance_confirmed: Number(o.balance_confirmed), payment_awaiting: Boolean(o.payment_awaiting), balance_ok: Boolean(o.balance_ok),
    label_ok: Boolean(o.label_ok), delivery_setup: o.delivery_setup ?? "client_label",
    tracking: extra.get(o.id!)?.tracking ?? null, hk_invoice_no: extra.get(o.id!)?.hk_invoice_no ?? null,
    reminders: balanceReminders.get(o.id!) ?? [],
  }));

  type U = { rma_id: string; resolution: string; credit_usd: number | null; batch_id: string | null; rma_batches: { cutoff_date: string; status: string } | null };
  const byRma = new Map<string, U[]>();
  for (const u of (units.data ?? []) as unknown as U[]) byRma.set(u.rma_id, [...(byRma.get(u.rma_id) ?? []), u]);
  const opsRmas: OpsRma[] = (rmas.data ?? []).map((r) => {
    const us = byRma.get(r.id!) ?? [];
    const batched = us.find((u) => u.rma_batches)?.rma_batches ?? null;
    return {
      id: r.id!, account_id: r.account_id!, account_code: r.account_code!, account_name: r.account_name!, number: r.number!, status: r.status!,
      created_at: r.created_at!, closed_at: r.closed_at, units: r.units ?? 0, units_without_evidence: r.units_without_evidence ?? 0,
      units_to_batch: r.units_to_batch ?? 0, intermediary_id: r.intermediary_id,
      batch: batched ? { cutoff_date: batched.cutoff_date, status: batched.status } : null,
      resolutions: us.map((u) => ({ resolution: u.resolution, credit_usd: Number(u.credit_usd ?? 0) })),
    };
  });

  const cutoff = { ...DEFAULT_CUTOFF, ...((cutoffSetting.data?.value ?? {}) as Partial<CutoffSetting>) };
  const next = nextCutoff(now, cutoff);
  return {
    today, week, orders: opsOrders, rmas: opsRmas, updates: reminders.data ?? [],
    accounts: (accounts.data ?? []) as OpsAccount[], intermediaries: intermediaries.data ?? [],
    cutoff: { ...next, time: cutoff.time, timezone: cutoff.timezone },
  };
}

/** A timestamp → its Hong Kong date. */
export function todayFromIso(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: HK, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
