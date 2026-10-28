import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PORTAL_LANG_COOKIE } from "@/lib/portal/session";
import { PORTAL_TEXT } from "@/lib/portal/texts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalLoginForm } from "./login-form";

export const metadata: Metadata = { title: { absolute: "Client portal · HK Refurbished Stock" } };

export default async function PortalLogin({ searchParams }: PageProps<"/portal/login">) {
  const sp = await searchParams;
  const jar = await cookies();
  const lang = sp.lang === "es" || (sp.lang !== "en" && jar.get(PORTAL_LANG_COOKIE)?.value === "es") ? "es" : "en";
  const t = PORTAL_TEXT[lang];
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (claims?.claims?.sub && !sp.error) {
    const { data: acc } = await db.from("portal_account").select("id").maybeSingle();
    if (acc) redirect("/portal");
  }
  const error = sp.error === "link" ? t.linkError : sp.error === "noaccess" ? t.noAccess : null;
  return (
    <main className="flex min-h-svh items-center justify-center bg-hkr-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image src="/brand/logo.png" alt="HK Refurbished Stock" width={469} height={278} className="mx-auto mb-3 h-[72px] w-auto" priority />
          <p className="text-sm text-muted-foreground">{t.portal}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t.loginTitle}</CardTitle>
            <CardDescription>{t.loginIntro}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {error ? <p className="rounded-md bg-hkr-red-tint p-2 text-sm text-hkr-action" role="alert" data-testid="portal-login-error">{error}</p> : null}
            <PortalLoginForm lang={lang} />
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs">
          <a href={`/portal/login?lang=${lang === "es" ? "en" : "es"}`} className="text-muted-foreground underline">{t.language}</a>
        </p>
      </div>
    </main>
  );
}
