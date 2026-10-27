"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function WaTabs({ role }: { role: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/whatsapp", label: "Inbox", show: true, exact: true },
    { href: "/whatsapp/broadcasts", label: "Broadcasts", show: role === "admin" || role === "bd" },
    { href: "/whatsapp/templates", label: "Templates", show: true },
    { href: "/whatsapp/numbers", label: "Numbers", show: role === "admin" },
  ].filter((t) => t.show);
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href}
            className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              active && "border-foreground font-medium text-foreground")}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
