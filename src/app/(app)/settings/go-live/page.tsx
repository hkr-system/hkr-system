import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, Hand } from "lucide-react";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Go-live checklist" };

function isRecent(at: string | undefined, days: number) {
  return at ? Date.now() - new Date(at).getTime() < days * 86400_000 : false;
}

type Item = { title: string; state: "done" | "todo" | "manual"; detail: string; href?: string };

// Brief Phase 7 item 5 (pulled forward, Oct 30 2026): what must be true before real data goes in.
// Green = checked by the system now; grey = still to do; hand = only a person can confirm it.
export default async function GoLivePage() {
  const access = await checkSection("settings");
  if (!access.allowed || access.user.role !== "admin") return <NoAccess />;
  const db = await createClient();
  const [users, demoAccounts, demoLeads, demoNumbers, skus, settings] = await Promise.all([
    db.from("profiles").select("email, role, active"),
    db.from("accounts").select("id", { count: "exact", head: true }).eq("is_demo", true),
    db.from("leads").select("id", { count: "exact", head: true }).like("email", "demo%@example.com"),
    db.from("wa_numbers").select("id", { count: "exact", head: true }).eq("is_demo", true),
    db.from("skus").select("id", { count: "exact", head: true }),
    db.from("settings").select("key, value").in("key", ["invoice_issuers", "last_backup", "wa_message_rates"]),
  ]);
  const get = (k: string) => settings.data?.find((s) => s.key === k)?.value as Record<string, unknown> | undefined;
  const staff = (users.data ?? []).filter((u) => u.role);
  const real = staff.filter((u) => u.active && !/\.demo@/.test(u.email ?? ""));
  const demoActive = staff.filter((u) => u.active && /\.demo@/.test(u.email ?? ""));
  const ever = ((get("invoice_issuers") ?? {}).ever_state ?? {}) as { company?: string; bank_lines?: string[]; usdt_lines?: string[]; stamp?: string };
  const backup = get("last_backup") as { at?: string; tables?: number } | undefined;
  const backupFresh = isRecent(backup?.at, 8);
  const demoLeft = (demoAccounts.count ?? 0) + (demoLeads.count ?? 0) + (demoNumbers.count ?? 0);
  const env = (k: string) => Boolean(process.env[k]);

  const items: Item[] = [
    { title: "Real users with a role", state: real.length >= 2 ? "done" : "todo", href: "/settings",
      detail: `${real.length} active real login(s): ${real.map((u) => `${u.email} (${u.role})`).join(", ") || "none yet"}. Create them in Supabase → Authentication → Users, then give the role in Settings → Users.` },
    { title: "Demo users switched off", state: demoActive.length === 0 ? "done" : "todo", href: "/settings",
      detail: demoActive.length ? `Still active: ${demoActive.map((u) => u.email).join(", ")}. Untick "Active" in Settings → Users (after your real admin login works).` : "No demo login can sign in." },
    { title: "Demo data deleted", state: demoLeft === 0 ? "done" : "todo",
      detail: demoLeft ? `Left: ${demoAccounts.count ?? 0} demo accounts, ${demoLeads.count ?? 0} demo leads, ${demoNumbers.count ?? 0} demo WhatsApp numbers. Run supabase/manual/delete_demo_data.sql once in the SQL Editor.` : "No demo accounts, leads or numbers left." },
    { title: "Invoice company details (Ever State)", state: ever.company && ever.bank_lines?.length && ever.usdt_lines?.length && ever.stamp ? "done" : "todo", href: "/settings#invoices",
      detail: `Company ${ever.company ? "✓" : "missing"} · bank block ${ever.bank_lines?.length ? "✓" : "missing"} · USDT block ${ever.usdt_lines?.length ? "✓" : "missing"} · stamp ${ever.stamp ? "✓" : "missing"}. Streamline FZE only when its first invoice is needed.` },
    { title: "Real SKUs loaded", state: (skus.count ?? 0) > 5 ? "done" : "todo", href: "/settings",
      detail: `${skus.count ?? 0} SKUs. Add the models / storage / colours you sell in Settings → SKUs before the first real order.` },
    { title: "Weekly backup running", state: backupFresh ? "done" : "todo",
      detail: backup?.at ? `Last backup ${formatDateTime(backup.at, access.user.timezone)} (${backup.tables} tables, in Supabase → Storage → backups).` : "No backup yet: the first one runs on Sunday 04:00 UTC (or press Run in Vercel → Settings → Cron Jobs)." },
    { title: "WhatsApp connected", state: env("WHATSAPP_ACCESS_TOKEN") && env("WHATSAPP_WABA_ID") ? "done" : "todo",
      detail: "Token and account set in Vercel. The current token is the 60-day one (expires late December): replace it with the permanent system-user token when the second admin approves." },
    { title: "Meta business verification", state: "manual", detail: "Meta → Security Center. Raises the 2-number limit (needed for the LATAM +1 number)." },
    { title: "Email sending (Brevo SMTP)", state: env("BREVO_API_KEY") ? "done" : "manual",
      detail: "Needed for portal sign-in emails and the EU batch email. Until then, use “Copy sign-in link” for client portal logins." },
    { title: "Client portal terms document", state: "manual", detail: "The official terms (RMA address, bank/USDT details, procedures). The portal shows “coming soon” until then." },
    { title: "Paid plans (Supabase Pro + Vercel Pro)", state: "manual", detail: "Decided Oct 30 2026: not yet. Our weekly backup covers the data meanwhile; Vercel Hobby is for non-commercial use." },
  ];
  const done = items.filter((i) => i.state === "done").length;

  return (
    <>
      <PageHeader title="Go-live checklist" description={`What must be true before real data goes in · ${done} of ${items.length} confirmed by the system`} />
      <Card>
        <CardHeader><CardTitle>Before the first real account</CardTitle><CardDescription>Green = checked now · grey = to do · hand = confirm by hand</CardDescription></CardHeader>
        <CardContent>
          <ul className="grid gap-3" data-testid="go-live">
            {items.map((i) => (
              <li key={i.title} className="flex gap-3">
                {i.state === "done" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Done" />
                  : i.state === "manual" ? <Hand className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Confirm by hand" />
                    : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="To do" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{i.href ? <Link href={i.href} className="hover:underline">{i.title}</Link> : i.title}</p>
                  <p className="text-sm text-muted-foreground">{i.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
