import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { countryOptions } from "@/lib/leads/countries";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";
import { ApplyForm } from "./apply-form";
import { Eyebrow, H2, Landing } from "./landing";
import { StickyCta } from "./sticky-cta";
import { T, type Lang } from "./texts";

export const metadata: Metadata = {
  title: "Get the price list",
  robots: { index: true, follow: false },
};

const FORM_HREF = "#aplicar";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function str(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim().slice(0, 120) : null;
}

// Public landing + qualification form. Tracking in the link: /apply?src=wa|email|linkedin|expo&ref=<owner>&utm_*.
export default async function ApplyPage({ searchParams }: PageProps<"/apply">) {
  const sp = await searchParams;
  const lang: Lang = sp.lang === "es" ? "es" : "en";
  const t = T[lang];
  const tracking = {
    src: str(sp.src),
    ref: str(sp.ref),
    utm: Object.fromEntries(UTM_KEYS.map((k) => [k, str(sp[k])]).filter(([, v]) => v)) as Record<string, string>,
  };
  const whatsappFallback = await loadPublicWhatsApp();
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== "lang" && typeof v === "string") keep.set(k, v);
  if (lang !== "es") keep.set("lang", "es");
  const otherHref = `/apply${keep.toString() ? `?${keep}` : ""}`;

  return (
    <main className="min-h-svh bg-hkr-bg text-hkr-ink">
      <header className="sticky top-0 z-10 border-b bg-hkr-bg">
        <div className="mx-auto flex min-h-14 max-w-[560px] items-center justify-between gap-3 px-4">
          <a href="#top" className="flex items-center"><Image src="/brand/logo.png" alt="HK Refurbished Stock" width={469} height={278} className="h-[42px] w-auto" priority /></a>
          <div className="flex items-center gap-3">
            <Link href={otherHref} className="text-sm text-hkr-ink-2 hover:underline">{t.other}</Link>
            <a href={FORM_HREF} className="inline-flex h-10 items-center rounded-[9px] bg-hkr-action px-4 font-heading text-sm font-extrabold text-white">{t.ctaShort}</a>
          </div>
        </div>
      </header>
      <span id="top" />

      <div id="landing"><Landing t={t} formHref={FORM_HREF} /></div>

      <section id="aplicar" className="bg-hkr-bg-2 py-12 has-[[data-testid=apply-done]]:bg-hkr-bg has-[[data-testid=apply-done]]:py-0">
        <div className="mx-auto grid max-w-[560px] gap-[18px] px-4">
          <div id="apply-intro">
            <Eyebrow>{t.form.eyebrow}</Eyebrow>
            <H2>{t.form.title}</H2>
            <p className="mt-2 text-hkr-ink-2">{t.form.sub}</p>
          </div>
          <ApplyForm key={lang} lang={lang} countries={countryOptions(lang)} tracking={tracking} whatsappFallback={whatsappFallback} />
        </div>
      </section>

      <footer className="border-t py-7 pb-28 text-center text-[13px] text-hkr-muted">
        <div className="mx-auto max-w-[560px] px-4">
          <Image src="/brand/logo.png" alt="" width={469} height={278} className="mx-auto mb-2.5 h-14 w-auto" />
          {t.footer}<br />
          <a href="https://hk-refurbished-stock.com" className="text-hkr-accent">hk-refurbished-stock.com</a>
        </div>
      </footer>
      <StickyCta formHref={FORM_HREF}>{t.cta}</StickyCta>
    </main>
  );
}

// Number shown on the thank-you page when the lead's market has no WhatsApp number assigned
// (setting apply_whatsapp_public, admin fills it in Settings → WhatsApp).
async function loadPublicWhatsApp(): Promise<string | null> {
  if (!adminClientAvailable()) return null;
  const db = createAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "apply_whatsapp_public").maybeSingle();
  const v = typeof data?.value === "string" ? data.value.trim() : "";
  return v || null;
}
