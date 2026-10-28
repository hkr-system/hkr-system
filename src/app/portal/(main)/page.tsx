import type { Metadata } from "next";
import Link from "next/link";
import { getPortalContext, portalDate, portalMoney } from "@/lib/portal/session";
import { PORTAL_ORDER_NEXT, PORTAL_ORDER_STATUS } from "@/lib/portal/texts";
import { RMA_STATUS_HELP_EN, RMA_STATUS_HELP_ES, type RmaStatus } from "@/lib/rmas/constants";
import { RmaStatusBadge } from "@/components/rmas/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: { absolute: "Client portal · HK Refurbished Stock" } };

export default async function PortalHome() {
  const { db, account, t, lang, contactName } = await getPortalContext();
  const [{ data: orders }, { data: rmas }, { data: cns }] = await Promise.all([
    db.from("portal_orders").select("id, number, status, order_date, payable_total, pays_in_eur, balance_pending, payment_awaiting, eta_date, tracking, courier").order("order_date", { ascending: false }),
    db.from("portal_rmas").select("id, number, status, units, units_without_evidence, created_at").order("created_at", { ascending: false }),
    db.from("portal_credit_notes").select("id, number, amount, currency, status"),
  ]);
  const open = (orders ?? []).filter((o) => !["delivered", "closed"].includes(o.status));
  const due = (cur: boolean) => open.filter((o) => Boolean(o.pays_in_eur) === cur).reduce((s, o) => s + Number(o.balance_pending), 0);
  const openRmas = (rmas ?? []).filter((r) => r.status !== "closed");
  const toApply = (cns ?? []).filter((c) => c.status === "issued");
  const help = lang === "es" ? RMA_STATUS_HELP_ES : RMA_STATUS_HELP_EN;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="portal-title">{t.hello(contactName ?? account.name)}</h1>
          <p className="text-sm text-muted-foreground">{t.homeIntro}</p>
        </div>
        <Button asChild><Link href="/portal/rmas/new">{t.newRma}</Link></Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="portal-kpis">
        <Kpi label={t.openOrders} value={String(open.length)} href="/portal/orders" />
        <Kpi label={t.balancePending} value={[due(false) ? portalMoney(due(false)) : "", due(true) ? portalMoney(due(true), "EUR") : ""].filter(Boolean).join(" + ") || portalMoney(0)} />
        <Kpi label={t.openRmas} value={String(openRmas.length)} href="/portal/rmas" />
        <Kpi label={t.creditsToApply} value={toApply.length ? toApply.map((c) => portalMoney(c.amount, c.currency)).join(" + ") : "0"} href="/portal/rmas" />
      </div>

      <Card>
        <CardHeader><CardTitle>{t.nextSteps}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm" data-testid="portal-next">
          {open.filter((o) => PORTAL_ORDER_NEXT[lang][o.status]).map((o) => (
            <Link key={o.id} href={`/portal/orders/${o.id}`} className="grid gap-0.5 rounded-md border p-3 hover:bg-muted/40 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:gap-3">
              <span className="font-mono text-xs font-medium">{o.number}</span>
              <span>{o.payment_awaiting ? t.paymentProcessing : PORTAL_ORDER_NEXT[lang][o.status]}</span>
              <span className="text-xs text-muted-foreground">{PORTAL_ORDER_STATUS[lang][o.status]}{o.tracking ? ` · ${o.courier ?? ""} ${o.tracking}` : o.eta_date ? ` · ETA ${portalDate(o.eta_date, lang)}` : ""}</span>
            </Link>
          ))}
          {openRmas.map((r) => (
            <Link key={r.id} href={`/portal/rmas/${r.id}`} className="grid gap-0.5 rounded-md border p-3 hover:bg-muted/40 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:gap-3">
              <span className="font-mono text-xs font-medium">{r.number}</span>
              <span>{r.units_without_evidence && r.status === "requested" ? t.missingEvidence : help[r.status as RmaStatus]}</span>
              <RmaStatusBadge status={r.status as RmaStatus} lang={lang} />
            </Link>
          ))}
          {!open.length && !openRmas.length ? <p className="text-muted-foreground">{t.nothingPending}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <div className="h-full rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block h-full hover:opacity-90">{body}</Link> : body;
}
