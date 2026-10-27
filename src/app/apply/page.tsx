import type { Metadata } from "next";
import Link from "next/link";
import { countryOptions } from "@/lib/leads/countries";
import { ApplyForm } from "./apply-form";
import { T, type Lang } from "./texts";

export const metadata: Metadata = {
  title: "Wholesale application",
  robots: { index: true, follow: false },
};

export default async function ApplyPage({ searchParams }: PageProps<"/apply">) {
  const sp = await searchParams;
  const lang: Lang = sp.lang === "es" ? "es" : "en";
  const t = T[lang];
  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">HKR</div>
            <span className="text-sm font-semibold">HK Refurbished Stock</span>
          </div>
          <Link href={lang === "es" ? "/apply" : "/apply?lang=es"} className="text-sm text-muted-foreground hover:underline">{t.other}</Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
        <p className="mt-3 mb-8 text-muted-foreground">{t.intro}</p>
        <ApplyForm key={lang} lang={lang} countries={countryOptions(lang)} />
      </div>
    </main>
  );
}
