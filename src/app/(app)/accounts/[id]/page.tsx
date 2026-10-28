import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countryName } from "@/lib/leads/countries";
import { loadTeam } from "@/lib/leads/service";
import { formatDateTime, todayIn } from "@/lib/format";
import { loadAssignments, loadIntermediaries, loadTerms } from "@/lib/orders/service";
import { BILLING_ENTITY_LABEL, DELIVERY_SETUP_LABEL, FILE_KINDS, PAYMENT_METHOD_LABEL, money, type AccountStatus } from "@/lib/orders/constants";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";
import { AccountStatusBadge } from "@/components/accounts/badges";
import { AccountForm } from "@/components/accounts/account-form";
import { ContactsPanel } from "@/components/accounts/contacts-panel";
import { PortalPanel } from "@/components/accounts/portal-panel";
import { CnStatusBadge, Flag, RmaStatusBadge } from "@/components/rmas/badges";
import type { RmaStatus } from "@/lib/rmas/constants";
import { OrdersTable, type OrderRow } from "@/components/orders/orders-table";
import { FileUpload } from "@/components/orders/file-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Account" };

const TABS = [
  ["overview", "Overview"], ["contacts", "Contacts"], ["orders", "Orders"],
  ["rmas", "RMAs"], ["price-lists", "Price lists"], ["files", "Files"], ["portal", "Client portal"], ["edit", "Set-up"],
] as const;

export default async function AccountPage({ params, searchParams }: PageProps<"/accounts/[id]">) {
  const access = await checkSection("accounts");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && TABS.some(([k]) => k === sp.tab) ? sp.tab : "overview";
  const db = await createClient();

  const { data: a } = await db.from("accounts").select("*, intermediaries(name)").eq("id", id).maybeSingle();
  if (!a) notFound();

  const [team, assign, contacts, orders, files, intermediaries, terms, chats, rmas, cns, portalUsers] = await Promise.all([
    loadTeam(db),
    loadAssignments(db, [id]),
    db.from("contacts").select("id, name, role, phone_e164, email, language, whatsapp_opt_in").eq("account_id", id).order("created_at"),
    db.from("order_overview").select("*").eq("account_id", id).order("order_date", { ascending: false }),
    db.from("files").select("id, kind, file_name, owner_table, owner_id, created_at, size_bytes").eq("account_id", id).order("created_at", { ascending: false }),
    loadIntermediaries(db),
    loadTerms(db),
    db.from("wa_conversations").select("id, contact_name, contact_phone, last_inbound_at").eq("account_id", id).order("last_message_at", { ascending: false }).limit(5),
    db.from("rma_overview").select("id, number, status, units, units_not_found, credit_usd, cap_usd, created_at").eq("account_id", id).order("created_at", { ascending: false }),
    db.from("credit_notes").select("id, number, status, amount, currency, issued_on, applied_invoice_no").eq("account_id", id).order("created_at", { ascending: false }),
    db.from("portal_users").select("id, email, language, active, last_login_at, created_at, contacts(name)").eq("account_id", id).order("created_at"),
  ]);
  const names = new Map(team.map((t) => [t.user_id, t.full_name.replace(/\s*\(demo\)/, "")]));
  const as = assign.get(id) ?? { owner: null, specialist: null };
  const orderRows = (orders.data ?? []) as unknown as OrderRow[];
  const orderNo = new Map(orderRows.map((o) => [o.id, o.number]));
  const open = orderRows.filter((o) => !["shipped", "delivered", "closed"].includes(o.status));
  const inter = (a.intermediaries as { name: string } | null)?.name;
  const fmt = (a.invoice_format ?? {}) as { battery_line_separate?: boolean; show_ce_text?: boolean; show_note?: boolean };
  const today = todayIn(user.timezone);

  return (
    <>
      <div className="mb-4">
        <Link href="/accounts" className="text-sm text-muted-foreground hover:underline">← Accounts</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="page-title">
            <span className="font-mono">{a.code}</span> · {a.name}
          </h1>
          <AccountStatusBadge status={a.status as AccountStatus} />
          {a.is_demo ? <span className="text-xs text-muted-foreground">demo data</span> : null}
          <div className="ml-auto"><Button asChild size="sm"><Link href={`/orders/new?account=${a.id}`}>New order</Link></Button></div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {countryName(a.country)} · {a.market} · {inter ? `via ${inter} (pays EUR)` : "direct (pays USD)"} · {PAYMENT_METHOD_LABEL[a.payment_method]} · owner {names.get(as.owner ?? "") ?? "not set"}
        </p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b" data-testid="account-tabs">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/accounts/${id}?tab=${k}`}
            className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              tab === k && "border-foreground font-medium text-foreground")}>
            {label}{k === "orders" && open.length ? ` (${open.length})` : ""}{k === "contacts" ? ` (${contacts.data?.length ?? 0})` : ""}
          </Link>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader><CardTitle>Open orders</CardTitle></CardHeader>
            <CardContent className="px-0"><OrdersTable orders={open} showAccount={false} today={today} /></CardContent>
          </Card>
          <div className="grid content-start gap-4">
            <Card>
              <CardHeader><CardTitle>Set-up</CardTitle></CardHeader>
              <CardContent className="grid gap-1.5 text-sm">
                <div><span className="text-muted-foreground">Legal entity: </span>{a.legal_name ?? "—"}{a.vat_eori ? ` · VAT/EORI ${a.vat_eori}` : ""}</div>
                <div><span className="text-muted-foreground">Billing entity: </span>{BILLING_ENTITY_LABEL[a.billing_entity]}</div>
                <div><span className="text-muted-foreground">Invoice: </span>battery line {fmt.battery_line_separate ? "separate" : "absorbed"}{fmt.show_ce_text ? " · CE text" : ""}{fmt.show_note ? " · note" : ""}</div>
                <div><span className="text-muted-foreground">Delivery: </span>{DELIVERY_SETUP_LABEL[a.delivery_setup]}</div>
                <div><span className="text-muted-foreground">Specialist: </span>{names.get(as.specialist ?? "") ?? "—"}</div>
                <div><span className="text-muted-foreground">Language: </span>{a.language === "es" ? "Spanish" : "English"}</div>
                {a.drive_folder_url ? <div><a href={a.drive_folder_url} target="_blank" rel="noreferrer" className="underline">Drive folder</a></div> : null}
                {a.whatsapp_group_note ? <div><span className="text-muted-foreground">WhatsApp group: </span>{a.whatsapp_group_note}</div> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Account Notes</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{a.notes || <span className="text-muted-foreground">Nothing written yet. If it is not written here, the next person does not know it (SOP §2.5).</span>}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>WhatsApp</CardTitle></CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {(chats.data ?? []).map((c) => (
                  <Link key={c.id} href={`/whatsapp?c=${c.id}`} className="hover:underline">{c.contact_name ?? c.contact_phone}<span className="ml-1 text-xs text-muted-foreground">{c.last_inbound_at ? formatDateTime(c.last_inbound_at, user.timezone) : ""}</span></Link>
                ))}
                {!chats.data?.length ? <span className="text-muted-foreground">No chats yet. Chats from the contacts&apos; phones appear here.</span> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "contacts" ? (
        <Card><CardContent className="px-0"><ContactsPanel accountId={id} country={a.country} contacts={contacts.data ?? []} /></CardContent></Card>
      ) : null}

      {tab === "orders" ? (
        <Card>
          <CardHeader><CardTitle>All orders ({orderRows.length})</CardTitle></CardHeader>
          <CardContent className="px-0">
            <OrdersTable orders={orderRows} showAccount={false} today={today} />
            <p className="px-4 pt-3 text-xs text-muted-foreground" data-tabular>
              Invoiced total: {money(orderRows.filter((o) => o.status !== "quoted").reduce((s, o) => s + Number(o.total_usd), 0))}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {tab === "rmas" ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>RMAs ({rmas.data?.length ?? 0})</CardTitle>
              <Button asChild size="sm" variant="outline"><Link href={`/rmas/new?account=${id}`}>New RMA</Link></Button>
            </CardHeader>
            <CardContent className="px-0">
              <Table data-testid="account-rmas">
                <TableHeader><TableRow><TableHead className="pl-4">RMA</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Credit / cap</TableHead><TableHead>Opened</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(rmas.data ?? []).map((r) => (
                    <TableRow key={r.id!}>
                      <TableCell className="pl-4"><Link href={`/rmas/${r.id}`} className="font-mono text-xs hover:underline">{r.number}</Link></TableCell>
                      <TableCell><RmaStatusBadge status={r.status as RmaStatus} />{r.units_not_found ? <span className="ml-1"><Flag tone="bad">{r.units_not_found} NOT FOUND</Flag></span> : null}</TableCell>
                      <TableCell className="text-right" data-tabular>{r.units}</TableCell>
                      <TableCell className={cn("text-right text-xs", Number(r.credit_usd) > Number(r.cap_usd) && Number(r.credit_usd) > 0 && "text-hkr-action")} data-tabular>{Number(r.credit_usd) ? money(r.credit_usd) : "—"} / {money(r.cap_usd)}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(r.created_at, user.timezone)}</TableCell>
                    </TableRow>
                  ))}
                  {!rmas.data?.length ? <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No RMAs.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Credit notes</CardTitle>
              <Button asChild size="sm" variant="outline"><Link href={`/rmas/credit-notes/new?account=${id}`}>New</Link></Button>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm" data-testid="account-cns">
              {(cns.data ?? []).map((c) => (
                <Link key={c.id} href={`/rmas/credit-notes/${c.id}`} className="flex flex-wrap items-center gap-2 hover:underline">
                  <span className="font-mono text-xs">{c.number}</span><CnStatusBadge status={c.status} />
                  <span className="ml-auto" data-tabular>{money(c.amount, c.currency)}</span>
                </Link>
              ))}
              {!cns.data?.length ? <p className="text-muted-foreground">None.</p> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {tab === "portal" ? (
        <Card>
          <CardHeader><CardTitle>Client portal</CardTitle></CardHeader>
          <CardContent>
            <PortalPanel accountId={id} defaultLang={a.language === "es" ? "es" : "en"} canManage={user.role !== "bd"}
              contacts={(contacts.data ?? []).map((c) => ({ id: c.id, name: c.name, email: c.email }))}
              users={(portalUsers.data ?? []).map((u) => ({ ...u, contact: (u.contacts as unknown as { name: string } | null)?.name ?? null }))} />
          </CardContent>
        </Card>
      ) : null}
      {tab === "price-lists" ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">The client&apos;s price lists arrive in Phase 6.</CardContent></Card>
      ) : null}

      {tab === "files" ? (
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
            <FileUpload accountId={id} accountCode={a.code} kinds={["OTHER"]} label="Upload an account file" />
          </CardHeader>
          <CardContent className="px-0">
            <Table data-testid="files-table">
              <TableHeader>
                <TableRow><TableHead className="pl-4">File</TableHead><TableHead>Type</TableHead><TableHead>Order</TableHead><TableHead>Uploaded</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(files.data ?? []).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="pl-4"><a href={`/api/files/${f.id}`} className="hover:underline" target="_blank" rel="noreferrer">{f.file_name}</a></TableCell>
                    <TableCell className="text-xs">{FILE_KINDS.find((k) => k.kind === f.kind)?.label ?? f.kind}</TableCell>
                    <TableCell className="text-xs">{f.owner_table === "orders" && f.owner_id ? <Link href={`/orders/${f.owner_id}`} className="hover:underline">{orderNo.get(f.owner_id) ?? "order"}</Link> : "—"}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(f.created_at, user.timezone)}</TableCell>
                  </TableRow>
                ))}
                {!files.data?.length ? <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No files yet. Order documents are uploaded from each order.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {tab === "edit" ? (
        <div className="max-w-4xl">
          <AccountForm mode="edit" isAdmin={user.role === "admin"} intermediaries={intermediaries} team={team} lastCodeSeq={terms.lastCodeSeq}
            values={{ ...a, invoice_format: fmt, owner: as.owner, specialist: as.specialist }} />
        </div>
      ) : null}
    </>
  );
}
