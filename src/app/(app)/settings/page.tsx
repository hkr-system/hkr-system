import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/coming-soon";
import { NoAccess } from "@/components/no-access";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SettingRow } from "./setting-row";
import { OwnerByMarketForm, ScoringRuleRow, TargetCountriesForm } from "./lead-settings";
import { countryName } from "@/lib/leads/countries";
import { META_MARKET_LABELS } from "@/lib/whatsapp/pricing";
import { MessageRatesForm } from "./message-rates";
import { InvoiceIssuerForm, type IssuerValue } from "./invoice-issuer";

export const metadata: Metadata = { title: "Settings" };

const CATEGORY_LABELS: Record<string, string> = {
  operations: "Operations calendar",
  engine: "Price-list engine",
  promotions: "Weekly promotions",
  leads: "Lead scoring",
  landing: "Landing page (/apply)",
  invoices: "Invoices — fixed texts",
};

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Edited with their own controls further down the page.
const SPECIAL_KEYS = ["lead_target_countries", "lead_owner_by_market", "wa_message_rates", "invoice_issuers"];

export default async function SettingsPage() {
  const access = await checkSection("settings");
  if (!access.allowed) return <NoAccess />;

  const supabase = await createClient();
  const [settings, users, rules, intermediaries, skus] = await Promise.all([
    supabase.from("settings").select("key, label, description, confidential, value, category, sort_order").order("sort_order"),
    supabase.from("profiles").select("user_id, full_name, email, role, timezone, active").order("full_name"),
    supabase.from("scoring_rules").select("id, label, operator, value, points, disqualify, active").order("sort_order"),
    supabase.from("intermediaries").select("id, name, country, default_cutoff_weekday").order("name"),
    supabase.from("skus").select("id, model, storage_gb, color, grade, battery_eligible").order("model"),
  ]);

  const categories = Object.keys(CATEGORY_LABELS);
  const settingValue = (key: string) => (settings.data ?? []).find((s) => s.key === key)?.value;
  const targetCountries = (Array.isArray(settingValue("lead_target_countries")) ? settingValue("lead_target_countries") : []) as string[];
  const ownerByMarket = (settingValue("lead_owner_by_market") ?? {}) as Record<string, string | null>;

  return (
    <>
      <PageHeader title="Settings" description="Parameters used by the modules. Changes are saved in the audit log." />

      <div className="grid gap-6">
        {categories.map((cat) => {
          const rows = (settings.data ?? []).filter((s) => s.category === cat && !SPECIAL_KEYS.includes(s.key));
          if (!rows.length) return null;
          return (
            <Card key={cat}>
              <CardHeader>
                <CardTitle>{CATEGORY_LABELS[cat]}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parameter</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => <SettingRow key={r.key} row={r} />)}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              New users are created in Supabase → Authentication → Users and start without a role. Role editing arrives with user management.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Time zone</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users.data ?? []).map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.role ? ROLE_LABELS[u.role] : <Badge variant="outline">No role</Badge>}</TableCell>
                    <TableCell>{u.timezone}</TableCell>
                    <TableCell>{u.active ? "Active" : "Inactive"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead scoring rules</CardTitle>
            <CardDescription>
              Points per rule (brief §3 row 8). Tier thresholds are in “Lead scoring” above. Changes apply to new form
              submissions, imports and edits; existing scores are not recalculated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead colSpan={3}>Points · value · active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rules.data ?? []).map((r) => <ScoringRuleRow key={r.id} rule={r} />)}
              </TableBody>
            </Table>
            <div className="mt-6 grid gap-2">
              <h3 className="text-sm font-medium">Target countries (+{(rules.data ?? []).find((r) => r.operator === "in_setting")?.points ?? 0} points)</h3>
              <TargetCountriesForm codes={targetCountries} names={targetCountries.map((c) => countryName(c))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead owner per market</CardTitle>
            <CardDescription>Owner given automatically to new /apply leads. Empty = nobody; the lead shows in everyone’s My day.</CardDescription>
          </CardHeader>
          <CardContent>
            <OwnerByMarketForm value={ownerByMarket} team={(users.data ?? []).filter((u) => u.active && (u.role === "admin" || u.role === "bd")).map((u) => ({ user_id: u.user_id, full_name: u.full_name || u.email }))} />
          </CardContent>
        </Card>

        <Card id="invoices">
          <CardHeader>
            <CardTitle>Invoices — company details</CardTitle>
            <CardDescription>
              Printed on every invoice of that billing entity: exporter block, signer, phones, the bank block (wire) or the USDT
              block (USDT orders) and the company stamp (approved invoices only). Kept in the database, never in the code.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {([["ever_state", "Ever State Electronics Technology"], ["streamline_fze", "Streamline FZE (Dubai)"]] as const).map(([key, label]) => (
              <InvoiceIssuerForm key={key} entity={key} label={label}
                value={(((settingValue("invoice_issuers") ?? {}) as Record<string, IssuerValue>)[key] ?? {})} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>WhatsApp message prices</CardTitle>
            <CardDescription>
              Meta’s price in US$ per delivered template message, by the client’s country (Meta groups some countries,
              e.g. “Rest of Western Europe”). Used for the estimated cost of broadcasts. Check them on Meta’s pricing page
              (whatsappbusiness.com → Pricing, currency USD) when Meta announces new rates, usually 1 Jan / 1 Apr / 1 Jul / 1 Oct.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MessageRatesForm
              value={(settingValue("wa_message_rates") ?? null) as never}
              markets={Object.entries(META_MARKET_LABELS).map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label))}
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Intermediaries</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Batch cutoff</TableHead>
                  </TableRow>
                </TableHeader>
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
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>SKUs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">GB</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Battery line</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(skus.data ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.model}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.storage_gb}</TableCell>
                      <TableCell>{s.color}</TableCell>
                      <TableCell>{s.battery_eligible ? "Eligible" : "Never"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
