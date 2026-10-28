import Image from "next/image";
import Link from "next/link";
import { getPortalContext } from "@/lib/portal/session";
import { PortalNav, LangSwitch } from "./portal-nav";
import { portalSignOut } from "../actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { account, t, lang, contactName, email } = await getPortalContext();
  const links = [
    { href: "/portal", label: t.home, exact: true },
    { href: "/portal/orders", label: t.orders },
    { href: "/portal/rmas", label: t.rmas },
    { href: "/portal/rmas/new", label: t.newRma, exact: true, primary: true },
    { href: "/portal/price-list", label: t.priceList },
    { href: "/portal/terms", label: t.terms },
  ];
  return (
    <div className="min-h-svh bg-hkr-bg" lang={lang}>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/portal" className="flex items-center gap-3">
            <Image src="/brand/logo.png" alt="HK Refurbished Stock" width={469} height={278} className="h-9 w-auto" priority />
            <span className="hidden text-sm text-muted-foreground sm:inline">{t.portal}</span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-right leading-tight md:block" data-testid="portal-account">
              <span className="block font-medium">{account.name}</span>
              <span className="block text-xs text-muted-foreground">{account.code} · {contactName ?? email}</span>
            </span>
            <LangSwitch lang={lang} label={t.language} />
            <form action={portalSignOut}><button type="submit" className="text-xs text-muted-foreground underline">{t.signOut}</button></form>
          </div>
        </div>
        <PortalNav links={links} />
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
