import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PORTAL_TEXT, type PortalLang } from "./texts";

export const PORTAL_LANG_COOKIE = "hkr_portal_lang";

// Who is the logged-in CLIENT. Staff and anyone without an active portal user go to the
// portal login (RLS + the portal_* views are the real guard; this only picks the screen).
export const getPortalContext = cache(async () => {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/portal/login");
  const [{ data: account }, { data: pu }] = await Promise.all([
    db.from("portal_account").select("*").maybeSingle(),
    db.from("portal_me").select("email, language, contact_name").maybeSingle(),
  ]);
  if (!account || !pu) redirect("/portal/login?error=noaccess");
  const jar = await cookies();
  const pref = jar.get(PORTAL_LANG_COOKIE)?.value;
  const lang: PortalLang = pref === "es" || pref === "en" ? pref : pu.language === "es" ? "es" : "en";
  return { db, account, email: pu.email ?? "", contactName: pu.contact_name ?? null, lang, t: PORTAL_TEXT[lang] };
});

export function portalMoney(v: number | string | null | undefined, currency: "USD" | "EUR" = "USD") {
  if (v === null || v === undefined || v === "") return "—";
  return `${currency === "EUR" ? "€" : "US$"} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))}`;
}

export function portalDate(d: string | null | undefined, lang: PortalLang) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, day)));
}
