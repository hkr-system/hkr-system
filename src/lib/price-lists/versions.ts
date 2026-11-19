import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/brands";
import { fmtDate } from "@/lib/price-lists/outputs";
import { listState, worstState, type ListState } from "@/lib/price-lists/send-status";

type Db = Awaited<ReturnType<typeof createClient>>;

// Which price list version a client has (Gabriel, Nov 18 2026): the version USED on an order (prices, margin, invoice), the
// client's CURRENT approved version and the version last SENT to the client (price_list_sends).
export type SentInfo = { listId: string; version: number; sentOn: string; channel: string; what: string };
export type UsedList = { listId: string; brand: Brand; version: number; status: string; lines: number };
export type ListVersionInfo = { brand: Brand; used: UsedList | null; current: number | null; sent: SentInfo | null };

export const CHANNEL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", portal: "Client portal", in_person: "In person", other: "Other" };

/** Last send per account + brand (RLS scopes the accounts). Key `${accountId}:${brand}`. */
export async function loadLastSends(db: Db, accountIds?: string[]): Promise<Map<string, SentInfo>> {
  let q = db.from("price_list_sends").select("price_list_id, account_id, sent_on, channel, created_at, variant, fx_rate, intermediaries(name), price_lists(version, brand)")
    .order("sent_on", { ascending: false }).order("created_at", { ascending: false }).limit(5000);
  if (accountIds) q = q.in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  const out = new Map<string, SentInfo>();
  for (const s of data ?? []) {
    const l = s.price_lists as unknown as { version: number; brand: Brand } | null;
    if (!l) continue;
    const k = `${s.account_id}:${l.brand}`;
    if (!out.has(k)) out.set(k, { listId: s.price_list_id, version: l.version, sentOn: s.sent_on, channel: s.channel, what: sendWhat(s) });
  }
  return out;
}

/** For one order: per brand, the list its prices came from, the client's current approved list and the last one sent. */
export async function orderListVersions(db: Db, orderId: string, accountId: string): Promise<ListVersionInfo[]> {
  const [{ data: lines }, { data: current }, sends] = await Promise.all([
    db.from("order_lines").select("price_list_row_id, price_list_rows(price_list_id, price_lists(id, brand, version, status))").eq("order_id", orderId),
    db.from("price_lists").select("brand, version").eq("account_id", accountId).eq("status", "approved"),
    loadLastSends(db, [accountId]),
  ]);
  const used = new Map<Brand, UsedList>();
  for (const l of lines ?? []) {
    const pl = (l.price_list_rows as unknown as { price_lists: { id: string; brand: Brand; version: number; status: string } | null } | null)?.price_lists;
    if (!pl) continue;
    const u = used.get(pl.brand);
    // one order normally uses one version per brand; if lines came from two, show the newest
    if (!u || pl.version > u.version) used.set(pl.brand, { listId: pl.id, brand: pl.brand, version: pl.version, status: pl.status, lines: (u?.lines ?? 0) + 1 });
    else u.lines += 1;
  }
  const brands = new Set<Brand>([...used.keys(), ...(current ?? []).map((c) => c.brand as Brand), ...[...sends.keys()].map((k) => k.split(":")[1] as Brand)]);
  return [...brands].sort().map((b) => ({
    brand: b, used: used.get(b) ?? null,
    current: (current ?? []).find((c) => c.brand === b)?.version ?? null,
    sent: sends.get(`${accountId}:${b}`) ?? null,
  })).filter((x) => x.used || x.current !== null);
}

/** Per account, a short text of what was last sent ("last sent to the client: iPhone v3 on 12-Nov-2026"), for the order form. */
export async function loadSentSummaries(db: Db): Promise<Record<string, string>> {
  const sends = await loadLastSends(db);
  const out: Record<string, string[]> = {};
  for (const [k, s] of sends) {
    const [acc, brand] = k.split(":");
    (out[acc] ??= []).push(`${brand === "samsung" ? "Samsung" : "iPhone"} v${s.version} on ${fmtDate(s.sentOn)}`);
  }
  return Object.fromEntries(Object.entries(out).map(([a, t]) => [a, t.sort().join(" · ")]));
}

/** "USD" or "EUR door to door via X @ 1.1200" for a recorded send (staff screens only — never on the client's file). */
export function sendWhat(s: { variant?: string | null; fx_rate?: number | null; intermediaries?: unknown }) {
  if (s.variant !== "d2d") return "USD";
  const via = (s.intermediaries as { name: string } | null)?.name;
  return `EUR door to door${via ? ` via ${via}` : ""}${s.fx_rate ? ` @ ${Number(s.fx_rate).toFixed(4)}` : ""}`;
}

// Price list state of every client (Gabriel, Nov 19 2026): dashboard tile + Price lists → Client lists filter. Active and onboarding
// accounts (RLS: a bd sees her accounts, and no drafts). iPhone always; Samsung only for clients that have a Samsung list.
export type BrandState = { brand: Brand; state: ListState; approved: { id: string; version: number; valid_until: string | null } | null; draftId: string | null; sent: SentInfo | null };
export type AccountListState = { id: string; code: string; name: string; state: ListState; brands: BrandState[] };

export async function loadListStates(db: Db, today: string): Promise<AccountListState[]> {
  const [{ data: accounts }, { data: lists }, sends] = await Promise.all([
    db.from("accounts").select("id, code, name").in("status", ["onboarding", "active"]).order("code").limit(5000),
    db.from("price_lists").select("id, account_id, brand, version, status, valid_until").in("status", ["draft", "approved"]).not("account_id", "is", null).limit(10000),
    loadLastSends(db),
  ]);
  return (accounts ?? []).map((a) => {
    const mine = (lists ?? []).filter((l) => l.account_id === a.id);
    const brands = (["iphone", "samsung"] as Brand[]).flatMap((brand) => {
      const approved = mine.find((l) => l.brand === brand && l.status === "approved") ?? null;
      const draft = mine.find((l) => l.brand === brand && l.status === "draft") ?? null;
      const sent = sends.get(`${a.id}:${brand}`) ?? null;
      if (brand !== "iphone" && !approved && !draft && !sent) return [];
      return [{
        brand, approved: approved ? { id: approved.id, version: approved.version, valid_until: approved.valid_until } : null, draftId: draft?.id ?? null, sent,
        state: listState({ approved, hasDraft: !!draft, sentVersion: sent?.version ?? null, today }),
      }];
    });
    return { id: a.id, code: a.code, name: a.name, brands, state: worstState(brands.map((b) => b.state)) };
  });
}
