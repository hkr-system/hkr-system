import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Section } from "@/lib/nav";

export function PageHeader({ title, description, children }: {
  title: string; description?: string; children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="page-title">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function ComingSoon({ section, readOnly }: { section: Section; readOnly?: boolean }) {
  return (
    <>
      <PageHeader title={section.label} description={section.summary}>
        {readOnly ? <Badge variant="secondary">Read-only for your role</Badge> : null}
      </PageHeader>
      <Card>
        <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <Construction className="size-5 shrink-0" aria-hidden />
          This module is built in Phase {section.phase}. The page is here so the menu and permissions can be checked now.
        </CardContent>
      </Card>
    </>
  );
}
