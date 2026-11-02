import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/coming-soon";
import { NoAccess } from "@/components/no-access";
import { SettingsSection } from "./section";
import { OpenFromHash } from "./open-from-hash";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SettingRow } from "./setting-row";
import { OwnerByMarketForm, ScoringRuleRow, TargetCountriesForm } from "./lead-settings";
import { countryName } from "@/lib/leads/countries";
import { META_MARKET_LABELS } from "@/lib/whatsapp/pricing";
import { MessageRatesForm } from "./message-rates";
import { InvoiceIssuerForm, type IssuerValue } from "./invoice-issuer";
import { SkuAddForm, SkuBatteryToggle, UserAccessRow } from "./admin-lists";

export const metadata: Metadata = { title: "Settings" };

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Edited with their own controls further down the page.
const SPECIAL_KEYS = ["lead_target_countries", "lead_owner_by_market", "wa_message_rates", "invoice_issuers"];

export default async function SettingsPage() {
  const access = await checkSection("settings");
  if (!access.allowed) return <NoAccess />;

  const supabase = await createClient();
  const [settings, users, rules, intermediaries, skus, portalUsers] = await Promise.all([
    supabase.from("settings").select("key, label, description, confidential, value, category, sort_order").order("sort_order"),
    supabase.from("profiles").select("user_id, full_name, email, role, timezone, active").order("full_name"),
    supabase.from("scoring_rules").select("id, label, operator, value, points, disqualify, active").order("sort_order"),
    supabase.from("intermediaries").select("id, name, country, default_cutoff_weekday").order("name"),
    supabase.from("skus").select("id, model, storage_gb, color, grade, battery_eligible").order("model"),
    supabase.from("portal_users").select("user_id"),
  ]);
  // client-portal logins are managed per account (Accounts → Client portal), not here
  const portalIds = new Set((portalUsers.data ?? []).map((p) => p.user_id));
  const staffUsers = (users.data ?? []).filter((u) => !portalIds.has(u.user_id));

  const settingValue = (key: string) => (settings.data ?? []).find((s) => s.key === key)?.value;
  const targetCountries = (Array.isArray(settingValue("lead_target_countries")) ? settingValue("lead_target_countries") : []) as string[];
  const ownerByMarket = (settingValue("lead_owner_by_market") ?? {}) as Record<string, string | null>;

  const paramTable = (cat: string) => {
    const rows = (settings.data ?? []).filter((s) => s.category === cat && !SPECIAL_KEYS.includes(s.key));
    if (!rows.length) return null;
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Parameter</TableHead><TableHead>Value</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => <SettingRow key={r.key} row={r} />)}</TableBody>
      </Table>
    );
  };
  const ever = (((settingValue("invoice_issuers") ?? {}) as Record<string, IssuerValue>).ever_state ?? {});

  const INDEX: [string, string][] = [
    ["users", "Users"], ["invoices", "Invoices"], ["skus", "SKUs"], ["whatsapp", "WhatsApp prices"], ["leads", "Leads"],
    ["operations", "Operations calendar"], ["engine", "Price-list engine"], ["promotions", "Weekly promotions"],
    ["intermediaries", "Intermediaries"], ["landing", "Landing page"],
  ];

  return (
    <>
      <PageHeader title="Settings" description="Click a section to open it. Changes are saved in the audit log." />
      <nav className="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Settings sections">
        <Link href="/settings/go-live" className="mr-2 font-medium text-hkr-accent hover:underline">Go-live checklist →</Link>
        {INDEX.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-md border px-2 py-0.5 text-muted-foreground hover:border-hkr-accent hover:text-foreground">{label}</a>
        ))}
      </nav>

      <OpenFromHash />
      <div className="grid gap-3">
        <SettingsSection id="users" title="Users" count={`${staffUsers.length}`}
          description="Who can sign in and with which role. Logins are created in Supabase → Authentication → Users.">
          <p className="mb-3 text-sm text-muted-foreground">
            Create a login in Supabase → Authentication → Users (Add user → email + password, Auto Confirm). It appears here
            without a role: give it one and press Save. Inactive users cannot sign in to the system.
          </p>
          <Table>
            <TableHeader><TableRow><TableHead colSpan={2}>Email</TableHead><TableHead colSpan={3}>Name · role · active · time zone</TableHead></TableRow></TableHeader>
            <TableBody>{staffUsers.map((u) => <UserAccessRow key={u.user_id} u={u} isMe={u.user_id === access.user.id} />)}</TableBody>
          </Table>
        </SettingsSection>

        <SettingsSection id="invoices" title="Invoices" count={ever.company ? "Ever State filled" : "company details missing"}
          description="Company details, bank / USDT blocks and stamp printed on invoices; fixed texts and numbering.">
          <div className="grid gap-4">
            {([["ever_state", "Ever State Electronics Technology"], ["streamline_fze", "Streamline FZE (Dubai)"]] as const).map(([key, label]) => (
              <InvoiceIssuerForm key={key} entity={key} label={label}
                value={(((settingValue("invoice_issuers") ?? {}) as Record<string, IssuerValue>)[key] ?? {})} />
            ))}
            <h3 className="mt-2 text-sm font-medium">Fixed texts on every invoice</h3>
            {paramTable("invoices")}
          </div>
        </SettingsSection>

        <SettingsSection id="skus" title="SKUs" count={`${(skus.data ?? []).length}`} description="Models, storage and colours you sell; used in orders and invoices.">
          <div className="grid gap-4">
            <SkuAddForm />
            <Table>
              <TableHeader><TableRow><TableHead>Model</TableHead><TableHead className="text-right">GB</TableHead><TableHead>Color</TableHead><TableHead>Separate battery line</TableHead></TableRow></TableHeader>
              <TableBody>
                {(skus.data ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.model}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.storage_gb}</TableCell>
                    <TableCell>{s.color}</TableCell>
                    <TableCell><SkuBatteryToggle id={s.id} eligible={s.battery_eligible} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SettingsSection>

        <SettingsSection id="whatsapp" title="WhatsApp message prices"
          description="Meta’s price per delivered message by country, for the estimated cost of broadcasts.">
          <p className="mb-3 text-sm text-muted-foreground">
            Meta groups some countries (e.g. “Rest of Western Europe”). Check the prices on Meta’s pricing page
            (whatsappbusiness.com → Pricing, currency USD) when Meta announces new rates, usually 1 Jan / 1 Apr / 1 Jul / 1 Oct.
          </p>
          <MessageRatesForm
            value={(settingValue("wa_message_rates") ?? null) as never}
            markets={Object.entries(META_MARKET_LABELS).map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label))}
          />
        </SettingsSection>

        <SettingsSection id="leads" title="Leads" description="Tier thresholds, scoring rules, target countries and the owner of new leads per market.">
          <div className="grid gap-6">
            {paramTable("leads")}
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Scoring rules</h3>
              <p className="text-sm text-muted-foreground">Points per rule. Changes apply to new form submissions, imports and edits; existing scores are not recalculated.</p>
              <Table>
                <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead colSpan={3}>Points · value · active</TableHead></TableRow></TableHeader>
                <TableBody>{(rules.data ?? []).map((r) => <ScoringRuleRow key={r.id} rule={r} />)}</TableBody>
              </Table>
            </div>
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Target countries (+{(rules.data ?? []).find((r) => r.operator === "in_setting")?.points ?? 0} points)</h3>
              <TargetCountriesForm codes={targetCountries} names={targetCountries.map((c) => countryName(c))} />
            </div>
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Lead owner per market</h3>
              <p className="text-sm text-muted-foreground">Owner given automatically to new /apply leads. Empty = nobody; the lead shows in everyone’s My day.</p>
              <OwnerByMarketForm value={ownerByMarket} team={(users.data ?? []).filter((u) => u.active && (u.role === "admin" || u.role === "bd")).map((u) => ({ user_id: u.user_id, full_name: u.full_name || u.email }))} />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection id="operations" title="Operations calendar" description="Thursday client updates, Friday EU batch cut-off, report time, credit-note issuer, inactive accounts.">
          {paramTable("operations")}
        </SettingsSection>

        <SettingsSection id="engine" title="Price-list engine" description="Margins and RMA amortization used by the price lists (admin only).">
          {paramTable("engine")}
        </SettingsSection>

        <SettingsSection id="promotions" title="Weekly promotions" description="Default quantity tier, discount range and margin floor.">
          {paramTable("promotions")}
        </SettingsSection>

        <SettingsSection id="intermediaries" title="Intermediaries" count={`${(intermediaries.data ?? []).length}`} description="EU intermediaries and their batch cut-off day.">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Country</TableHead><TableHead>Batch cutoff</TableHead></TableRow></TableHeader>
            <TableBody>
              {(intermediaries.data ?? []).map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell>{i.country ?? "—"}</TableCell>
                  <TableCell>{i.default_cutoff_weekday ? WEEKDAYS[i.default_cutoff_weekday] : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsSection>

        <SettingsSection id="landing" title="Landing page (/apply)" description="Public WhatsApp number and other options of the qualification form.">
          {paramTable("landing") ?? <p className="text-sm text-muted-foreground">No options.</p>}
        </SettingsSection>
      </div>
    </>
  );
}
