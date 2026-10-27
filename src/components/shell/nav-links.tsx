"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, ShoppingCart, RotateCcw, Tags, Target, MessageCircle, Settings, Landmark,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SectionKey } from "@/lib/nav";

const ICONS: Record<SectionKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  accounts: Building2,
  orders: ShoppingCart,
  rmas: RotateCcw,
  "price-lists": Tags,
  leads: Target,
  whatsapp: MessageCircle,
  finance: Landmark,
  settings: Settings,
};

export type NavItem = { key: SectionKey; label: string; href: string; also?: readonly string[]; badge?: number };

export function NavLinks({ items, onNavigate, collapsed }: { items: NavItem[]; onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const active = [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
        const link = (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            data-testid={`nav-${item.key}`}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <span className="relative">
              <Icon className="size-4 shrink-0" aria-hidden />
              {collapsed && item.badge ? <span className="absolute -top-1 -right-1 size-2 rounded-full bg-hkr-action" aria-hidden /> : null}
            </span>
            {collapsed ? null : <span className="truncate">{item.label}</span>}
            {!collapsed && item.badge ? (
              <span className="ml-auto min-w-5 rounded-full bg-hkr-action px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums"
                data-testid={`badge-${item.key}`} aria-label={`${item.badge} pending`}>{item.badge > 99 ? "99+" : item.badge}</span>
            ) : null}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}{item.badge ? ` (${item.badge})` : ""}</TooltipContent>
          </Tooltip>
        ) : link;
      })}
    </nav>
  );
}
