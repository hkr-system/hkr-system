import type { Metadata } from "next";
import Link from "next/link";
import { checkSection } from "@/lib/auth";
import { sectionsFor, getSection } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/coming-soon";
import { NoAccess } from "@/components/no-access";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const access = await checkSection("dashboard");
  if (!access.allowed) return <NoAccess />;
  const { user } = access;
  const firstName = user.fullName.split(/\s+/)[0] || user.email;
  const sections = sectionsFor(user.role).filter((s) => s.key !== "dashboard");

  return (
    <>
      <PageHeader title={`Welcome, ${firstName}`} description={`Signed in as ${ROLE_LABELS[user.role]}.`} />
      <Card>
        <CardHeader>
          <CardTitle>Your modules</CardTitle>
          <CardDescription>
            The dashboard widgets arrive in Phase {getSection("dashboard").phase}. Until then, this is what your role can open.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {sections.map((s) => (
            <Link key={s.key} href={s.href}
              className="flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/60">
              <span>
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.summary}</span>
              </span>
              <Badge variant="outline" className="shrink-0">
                {s.phase === 0 ? "Ready" : `Phase ${s.phase}`}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
