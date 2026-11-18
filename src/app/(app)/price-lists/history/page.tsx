import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { BRANDS, BRAND_LABEL, isBrand, type Brand } from "@/lib/brands";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/price-lists/outputs";
import { pctText } from "@/lib/price-lists/labels";
import { CHANNEL_LABEL } from "@/lib/price-lists/versions";
import { PRICE_LIST_TABS } from "@/lib/price-lists/tabs";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { SectionTabs } from "@/components/sales/tabs";
import { ListStatusBadge } from "@/components/price-lists/badges";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Price list history" };

// Price lists → History (Gabriel, Nov 18 2026): every version of every list — base (admin) and clients — with the base it was
// built on, who approved it, when it was sent to the client and its files. ★ = the version the client has (last sent).
export default async function PriceListHistoryPage({ searchParams }: PageProps<"/price-lists/history">) {
  const access = await checkSection("price-lists");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const isAdmin = user.role === "admin";
  const sp = await searchParams;
  const p = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const account = /^[0-9a-f-]{36}$/.test(p("account")) ? p("account") : "";
  const brandP = p("brand"); const brand: Brand | "" = isBrand(brandP) ? brandP : "";
  const kind = ["base", "client"].includes(p("kind")) ? p("kind") : "";
  const status = ["approved", "superseded", "draft"].includes(p("status")) ? p("status") : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(p("from")) ? p("from") : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(p("to")) ? p("to") : "";

  const db = await createClient();
  let q = db.from("price_lists").select("id, account_id, brand, version, status, valid_from, valid_until, base_list_id, rma_c, extra_c, approved_at, approved_by, created_at, accounts(code, name)")
    .order("created_at", { ascending: false }).limit(500);
  if (account) q = q.eq("account_id", account);
  else if (kind === "base") q = q.is("account_id", null);
  else if (kind === "client") q = q.not("account_id", "is", null);
  if (brand) q = q.eq("brand", brand);
  if (status) q = q.eq("status", status as "approved");
  if (from) q = q.gte("valid_from", from);
  if (to) q = q.lte("valid_from", to);
  const [{ data: lists }, { data: accounts }, { data: sends }, { data: files }, { data: people }, { data: bases }] = await Promise.all([
    q,
    db.from("accounts").select("id, code, name").order("code"),
    db.from("price_list_sends").select("price_list_id, account_id, sent_on, channel, created_at").order("sent_on", { ascending: false }).order("created_at", { ascending: false }),
    db.from("files").select("id, owner_id, file_name").eq("owner_table", "price_lists").order("file_name"),
    db.from("profiles").select("user_id, full_name, email"),
    db.rpc("price_list_base_versions"),
  ]);
  const nameOf = (uid: string | null) => { const x = (people ?? []).find((y) => y.user_id === uid); return x ? x.full_name || x.email : "—"; };
  const baseV = (id: string | null) => (bases ?? []).find((b) => b.id === id)?.version;
  // the version each client has in hand = the newest send per client + brand
  const listBrand = new Map((lists ?? []).map((l) => [l.id, l.brand]));
  const has = new Set<string>(); const seen = new Set<string>();
  for (const s of sends ?? []) {
    const b = listBrand.get(s.price_list_id); if (!b) continue;
    const k = `${s.account_id}:${b}`; if (seen.has(k)) continue;
    seen.add(k); has.add(s.price_list_id);
  }
  const rows = lists ?? [];

  return (
    <>
      <PageHeader title="Price list history" description="Every version of every price list: when it was valid, the base it was built on, who approved it and when it was sent to the client. ★ = the version the client has." />
      <SectionTabs tabs={PRICE_LIST_TABS} />
      <form className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7 lg:items-end" data-testid="history-filters">
        <label className="grid gap-1 text-xs text-muted-foreground lg:col-span-2">Client
          <NativeSelect name="account" defaultValue={account} aria-label="Client">
            <option value="">All clients{isAdmin ? " and the base" : ""}</option>
            {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">Brand
          <NativeSelect name="brand" defaultValue={brand} aria-label="Brand">
            <option value="">All</option>
            {BRANDS.map((b) => <option key={b} value={b}>{BRAND_LABEL[b]}</option>)}
          </NativeSelect>
        </label>
        {isAdmin ? (
          <label className="grid gap-1 text-xs text-muted-foreground">List
            <NativeSelect name="kind" defaultValue={kind} aria-label="List">
              <option value="">Base and clients</option><option value="base">Base only</option><option value="client">Clients only</option>
            </NativeSelect>
          </label>
        ) : null}
        <label className="grid gap-1 text-xs text-muted-foreground">Status
          <NativeSelect name="status" defaultValue={status} aria-label="Status">
            <option value="">All</option><option value="approved">Approved (current)</option><option value="superseded">Superseded</option>
            {user.role !== "bd" ? <option value="draft">Draft</option> : null}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">Valid from
          <Input type="date" name="from" defaultValue={from} aria-label="Valid from" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">to
          <Input type="date" name="to" defaultValue={to} aria-label="Valid to" />
        </label>
        <div className="flex gap-2"><Button type="submit" size="sm">Filter</Button><Button asChild size="sm" variant="ghost"><Link href="/price-lists/history">Clear</Link></Button></div>
      </form>
      <Card>
        <CardContent className="px-0">
          <Table data-testid="history-table">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">List</TableHead><TableHead>Version</TableHead><TableHead>Status</TableHead><TableHead>Valid</TableHead>
                <TableHead>Built on</TableHead><TableHead className="text-right">RMA_c · Extra_c</TableHead><TableHead>Approved</TableHead>
                <TableHead>Sent to the client</TableHead><TableHead>Files</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => {
                const acc = l.accounts as unknown as { code: string; name: string } | null;
                const sent = (sends ?? []).filter((s) => s.price_list_id === l.id);
                const fl = (files ?? []).filter((f) => f.owner_id === l.id);
                return (
                  <TableRow key={l.id} data-testid="history-row">
                    <TableCell className="pl-4">
                      {acc ? <Link href={`/accounts/${l.account_id}?tab=price-lists`} className="font-medium hover:underline">{acc.code}</Link> : <span className="font-medium">Base list</span>}
                      <span className="block text-xs text-muted-foreground">{BRAND_LABEL[l.brand]}{acc ? ` · ${acc.name}` : ""}</span>
                    </TableCell>
                    <TableCell><Link href={`/price-lists/${l.id}`} className="font-medium hover:underline">v{l.version}</Link>{has.has(l.id) ? <span title="The client has this version (last sent)" data-testid="client-has"> ★</span> : null}</TableCell>
                    <TableCell><ListStatusBadge status={l.status} /></TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(l.valid_from)} – {l.valid_until ? fmtDate(l.valid_until) : "—"}</TableCell>
                    <TableCell>{l.account_id && baseV(l.base_list_id) ? `base v${baseV(l.base_list_id)}` : "—"}</TableCell>
                    <TableCell className="text-right">{l.account_id ? `${pctText(l.rma_c)} · ${pctText(l.extra_c)}` : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.approved_at ? <>{fmtDate(l.approved_at.slice(0, 10))}<span className="block text-xs text-muted-foreground">{nameOf(l.approved_by)}</span></> : "—"}</TableCell>
                    <TableCell>{!l.account_id || l.status === "draft" ? "—" : sent.length ? sent.map((s, i) => <span key={i} className="block whitespace-nowrap">{fmtDate(s.sent_on)} · {CHANNEL_LABEL[s.channel] ?? s.channel}</span>) : <span className="text-muted-foreground">not sent</span>}</TableCell>
                    <TableCell>{fl.length ? fl.map((f) => <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block text-hkr-accent hover:underline">{f.file_name.endsWith(".pdf") ? "PDF" : f.file_name.endsWith(".xlsx") ? "Excel" : f.file_name}</a>) : "—"}</TableCell>
                  </TableRow>
                );
              })}
              {!rows.length ? <TableRow><TableCell colSpan={9} className="pl-4 text-muted-foreground">No price lists match these filters.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {rows.length === 500 ? <p className="mt-2 text-xs text-muted-foreground">Showing the newest 500: use the filters to see older ones.</p> : null}
    </>
  );
}
