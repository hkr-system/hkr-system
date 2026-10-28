"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { setPortalLang } from "../actions";
import type { PortalLang } from "@/lib/portal/texts";

export function PortalNav({ links }: { links: { href: string; label: string; exact?: boolean; primary?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" data-testid="portal-nav">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname === l.href || (pathname.startsWith(`${l.href}/`) && !links.some((o) => o.href !== l.href && o.href.startsWith(l.href) && pathname.startsWith(o.href)));
        return (
          <Link key={l.href} href={l.href}
            className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              active && "border-hkr-ink font-medium text-foreground", l.primary && !active && "text-hkr-action")}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LangSwitch({ lang, label }: { lang: PortalLang; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} data-testid="lang-switch" className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
      onClick={() => start(async () => { await setPortalLang(lang === "es" ? "en" : "es"); router.refresh(); })}>
      {label}
    </button>
  );
}
