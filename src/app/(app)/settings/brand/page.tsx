import type { Metadata } from "next";
import Image from "next/image";
import { checkSection } from "@/lib/auth";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/coming-soon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Brand check" };

// Admin-only page to confirm the look before it is used on new screens.
// Tokens come from src/app/globals.css (source: claude/HKR_brand_tokens.md).
const TOKENS: { name: string; css: string; use: string }[] = [
  { name: "bg", css: "--hkr-bg", use: "Page ground" },
  { name: "bg-2", css: "--hkr-bg-2", use: "Sidebar, table headers, alternate bands" },
  { name: "surface", css: "--hkr-surface", use: "Cards, forms, panels" },
  { name: "ink", css: "--hkr-ink", use: "Headlines and body text" },
  { name: "ink-2", css: "--hkr-ink-2", use: "Secondary text" },
  { name: "muted", css: "--hkr-muted", use: "Placeholders, tertiary labels" },
  { name: "accent", css: "--hkr-accent", use: "Links, eyebrows, active menu item, focus ring" },
  { name: "accent-tint", css: "--hkr-accent-tint", use: "Selected rows, icon tiles, chips" },
  { name: "action", css: "--hkr-action", use: "The one primary button per screen" },
  { name: "red-tint", css: "--hkr-red-tint", use: "Loss, defect and overdue callouts" },
  { name: "ok", css: "--hkr-ok", use: "Paid, delivered, approved" },
  { name: "warn", css: "--hkr-warn", use: "Pending, due soon" },
];

const SAMPLE_ROWS = [
  { order: "BRC-NL-001 · ORD-07", pieces: 150, usd: "69,363.70", status: "Balance pending", tone: "warn" },
  { order: "ADG-GB-013 · ORD-02", pieces: 80, usd: "21,000.00", status: "Shipped", tone: "ok" },
  { order: "CLV-EC-004 · ORD-11", pieces: 210, usd: "58,420.00", status: "Deposit overdue", tone: "alert" },
];

function Chip({ tone, children }: { tone: "ok" | "warn" | "alert" | "neutral"; children: React.ReactNode }) {
  const styles: Record<typeof tone, React.CSSProperties> = {
    ok: { background: "color-mix(in oklab, var(--hkr-ok) 14%, white)", color: "#1b7a47", borderColor: "color-mix(in oklab, var(--hkr-ok) 40%, white)" },
    warn: { background: "color-mix(in oklab, var(--hkr-warn) 14%, white)", color: "#8a5600", borderColor: "color-mix(in oklab, var(--hkr-warn) 40%, white)" },
    alert: { background: "var(--hkr-red-tint)", color: "var(--hkr-action-dark)", borderColor: "color-mix(in oklab, var(--hkr-action) 40%, white)" },
    neutral: { background: "var(--hkr-accent-tint)", color: "var(--hkr-accent)", borderColor: "transparent" },
  };
  return (
    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold" style={styles[tone]}>
      {children}
    </span>
  );
}

export default async function BrandPage() {
  const access = await checkSection("settings");
  if (!access.allowed) return <NoAccess />;

  return (
    <>
      <PageHeader title="Brand check" description="Every token, both typefaces, buttons, chips and a sample table, so the look can be approved before new screens use it.">
        <Image src="/brand/logo.png" alt="HK Refurbished Stock" width={469} height={278} className="h-12 w-auto" />
      </PageHeader>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Colors</CardTitle>
            <CardDescription>Light ground, navy for type and marks, red only for the one action.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOKENS.map((t) => (
                <div key={t.name} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <span className="size-10 shrink-0 rounded-md border" style={{ background: `var(${t.css})` }} aria-hidden />
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold">{t.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{t.use}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Type</CardTitle>
            <CardDescription>Archivo for headings and figures that lead; Source Sans 3 for everything else.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="font-heading text-3xl font-black tracking-tight">New Grade A+++ · 12 months of warranty</p>
            <p className="font-heading text-xl font-extrabold">Accounts, orders, payments</p>
            <p className="max-w-prose text-base">
              Body text at 15px. Every figure with its reference: invoice 09212026 · ORD-07 · AWB 1234 5678 9012. Dates in Hong Kong time and El Salvador time where it matters.
            </p>
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--hkr-accent)" }}>Eyebrow label</p>
            <p className="text-sm text-muted-foreground">Secondary text, captions and help lines.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
            <CardDescription>One red button per screen. Secondary actions stay white with a hairline.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button>Approve price list</Button>
              <Button variant="outline">Export xlsx</Button>
              <Button variant="secondary">Filter</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="destructive">Delete draft</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="ok">Paid</Chip>
              <Chip tone="warn">Balance due</Chip>
              <Chip tone="alert">Overdue 5 days</Chip>
              <Chip tone="neutral">In production</Chip>
              <Badge>Default badge</Badge>
              <Badge variant="secondary">Secondary badge</Badge>
              <Badge variant="outline">Outline badge</Badge>
            </div>
            <div className="grid max-w-md gap-2">
              <label htmlFor="brand-sample-input" className="text-sm font-semibold">Sample input</label>
              <Input id="brand-sample-input" placeholder="Invoice number" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sample table</CardTitle>
            <CardDescription>Tabular numbers, status chips, hairline rows.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Pieces</TableHead>
                  <TableHead className="text-right">Invoice USD</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SAMPLE_ROWS.map((r) => (
                  <TableRow key={r.order}>
                    <TableCell className="font-medium">{r.order}</TableCell>
                    <TableCell className="text-right">{r.pieces}</TableCell>
                    <TableCell className="text-right">{r.usd}</TableCell>
                    <TableCell><Chip tone={r.tone as "ok" | "warn" | "alert"}>{r.status}</Chip></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
