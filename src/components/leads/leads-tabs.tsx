"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/leads", label: "My day", workersOnly: true, exact: true },
  { href: "/leads/list", label: "All leads" },
  { href: "/leads/board", label: "Board", workersOnly: true },
  { href: "/leads/import", label: "Import", workersOnly: true },
];

export function LeadsTabs({ canWork }: { canWork: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => canWork || !t.workersOnly);
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              active && "border-foreground font-medium text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
