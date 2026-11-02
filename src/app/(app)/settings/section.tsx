import { ChevronDown } from "lucide-react";

// One collapsible block of the Settings page (Gabriel, Nov 2 2026: "secciones colapsables").
// Native <details>: works without JavaScript; opening a #link from the index expands it.
export function SettingsSection({ id, title, description, count, children, defaultOpen = false }: {
  id: string; title: string; description?: React.ReactNode; count?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  return (
    <details id={id} open={defaultOpen} className="group min-w-0 scroll-mt-20 rounded-xl border bg-card" data-testid={`section-${id}`}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="grid gap-0.5">
          <span className="font-heading text-base font-semibold">{title}{count ? <span className="ml-2 text-sm font-normal text-muted-foreground">{count}</span> : null}</span>
          {description ? <span className="text-sm text-muted-foreground">{description}</span> : null}
        </span>
        <ChevronDown className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="min-w-0 overflow-x-auto border-t px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}
