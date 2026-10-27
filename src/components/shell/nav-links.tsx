"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, ShoppingCart, RotateCcw, Tags, Target, MessageCircle, Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionKey } from "@/lib/nav";

const ICONS: Record<SectionKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  accounts: Building2,
  orders: ShoppingCart,
  rmas: RotateCcw,
  "price-lists": Tags,
  leads: Target,
  whatsapp: MessageCircle,
  settings: Settings,
};

export type NavItem = { key: SectionKey; label: string; href: string };

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            data-testid={`nav-${item.key}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
