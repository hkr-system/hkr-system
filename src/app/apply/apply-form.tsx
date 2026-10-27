"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { BUSINESS_TYPES, HEARD_ABOUT, VOLUME_RANGES } from "@/lib/leads/constants";
import { submitApplication, type ApplyState } from "./actions";
import { T, type Lang } from "./texts";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}{required ? <span className="text-destructive"> *</span> : null}</Label>
      {children}
    </div>
  );
}

function YesNo({ name, t }: { name: string; t: (typeof T)[Lang] }) {
  return (
    <div className="flex gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="radio" name={name} value="yes" required className="size-4" /> {t.yes}</label>
      <label className="flex items-center gap-2"><input type="radio" name={name} value="no" className="size-4" /> {t.no}</label>
    </div>
  );
}

export function ApplyForm({ lang, countries }: { lang: Lang; countries: { code: string; name: string }[] }) {
  const t = T[lang];
  const [state, action, pending] = useActionState<ApplyState, FormData>(submitApplication, {});

  if (state.done) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" data-testid="apply-done">
        <CheckCircle2 className="size-10 text-emerald-600" aria-hidden />
        <p className="max-w-sm text-base">{t.thanks}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="lang" value={lang} />
      {/* honeypot: hidden from people, tempting for bots */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Fax <input name="fax" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t.company} required><Input name="company" required autoComplete="organization" /></Field>
        <Field label={t.contact} required><Input name="contact_name" required autoComplete="name" /></Field>
        <Field label={t.email} required><Input name="email" type="email" required autoComplete="email" /></Field>
        <Field label={t.whatsapp}><Input name="whatsapp" type="tel" autoComplete="tel" placeholder="+31 6 1234 5678" /></Field>
        <Field label={t.country} required>
          <NativeSelect name="country" required defaultValue="" className="h-9">
            <option value="" disabled>{t.choose}</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t.city}><Input name="city" autoComplete="address-level2" /></Field>
        <Field label={t.website}><Input name="website" placeholder="www.example.com" /></Field>
        <Field label={t.businessType} required>
          <NativeSelect name="business_type" required defaultValue="" className="h-9">
            <option value="" disabled>{t.choose}</option>
            {BUSINESS_TYPES.map((b) => <option key={b.value} value={b.value}>{b[lang]}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t.sellsIphones} required><YesNo name="sells_iphones" t={t} /></Field>
        <Field label={t.sellsRefurbished} required><YesNo name="sells_refurbished" t={t} /></Field>
        <Field label={t.volume} required>
          <NativeSelect name="volume_range" required defaultValue="" className="h-9">
            <option value="" disabled>{t.choose}</option>
            {VOLUME_RANGES.map((v) => <option key={v.value} value={v.value}>{v[lang]}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t.heard}>
          <NativeSelect name="heard_about" defaultValue="" className="h-9">
            <option value="">{t.choose}</option>
            {HEARD_ABOUT.map((o) => <option key={o.value} value={o.value}>{o[lang]}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="whatsapp_opt_in" className="mt-0.5 size-4" /> {t.waOptIn}
      </label>
      <p className="text-xs text-muted-foreground">{t.consent}</p>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <div><Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto sm:px-8">{pending ? t.sending : t.submit}</Button></div>
    </form>
  );
}
