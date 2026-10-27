"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { BUSINESS_TYPES, MARKETS, VOLUME_RANGES } from "@/lib/leads/constants";
import type { ActionState } from "@/app/(app)/leads/actions";

export type LeadFormValues = {
  id?: string;
  company?: string | null; contact_name?: string | null; title?: string | null; email?: string | null;
  phone_e164?: string | null; country?: string | null; city?: string | null; market?: string | null;
  website?: string | null; linkedin_url?: string | null; business_type?: string | null;
  sells_iphones?: boolean | null; sells_refurbished?: boolean | null; volume_range?: string | null;
  volume_units_month?: number | null; language?: string | null; source?: string | null;
  whatsapp_opt_in?: boolean; email_opt_out?: boolean;
};

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  values?: LeadFormValues;
  countries: { code: string; name: string }[];
  team?: { user_id: string; full_name: string }[];
  submitLabel: string;
  disabled?: boolean;
  showOptIns?: boolean;
};

function triState(v: boolean | null | undefined) {
  return v === true ? "yes" : v === false ? "no" : "";
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function LeadForm({ action, values = {}, countries, team, submitLabel, disabled, showOptIns }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const knownRange = VOLUME_RANGES.some((r) => r.value === values.volume_range);

  return (
    <form action={formAction} className="grid gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <fieldset disabled={disabled || pending} className="grid gap-4 sm:grid-cols-2">
        <Field label="Company *"><Input name="company" required defaultValue={values.company ?? ""} /></Field>
        <Field label="Contact name"><Input name="contact_name" defaultValue={values.contact_name ?? ""} /></Field>
        <Field label="Job title"><Input name="title" defaultValue={values.title ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={values.email ?? ""} /></Field>
        <Field label="Phone / WhatsApp (with country code)"><Input name="phone" defaultValue={values.phone_e164 ?? ""} placeholder="+31 6 1234 5678" /></Field>
        <Field label="Country">
          <NativeSelect name="country" defaultValue={values.country ?? ""}>
            <option value="">—</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="City"><Input name="city" defaultValue={values.city ?? ""} /></Field>
        <Field label="Market (empty = from country)">
          <NativeSelect name="market" defaultValue={values.market ?? ""}>
            <option value="">From country</option>
            {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Website"><Input name="website" defaultValue={values.website ?? ""} /></Field>
        <Field label="LinkedIn URL"><Input name="linkedin_url" defaultValue={values.linkedin_url ?? ""} /></Field>
        <Field label="Business type">
          <NativeSelect name="business_type" defaultValue={values.business_type ?? ""}>
            <option value="">—</option>
            {BUSINESS_TYPES.map((b) => <option key={b.value} value={b.value}>{b.en}{b.excluded ? " (excluded)" : ""}</option>)}
            {values.business_type && !BUSINESS_TYPES.some((b) => b.value === values.business_type) ? (
              <option value={values.business_type}>{values.business_type}</option>
            ) : null}
          </NativeSelect>
        </Field>
        <Field label="Volume per month">
          <NativeSelect name="volume_range" defaultValue={knownRange ? values.volume_range ?? "" : ""}>
            <option value="">{values.volume_units_month != null && !knownRange ? `${values.volume_units_month} units (imported)` : "—"}</option>
            {VOLUME_RANGES.map((r) => <option key={r.value} value={r.value}>{r.en}</option>)}
          </NativeSelect>
          {!knownRange && values.volume_units_month != null ? <input type="hidden" name="volume_units_month" value={values.volume_units_month} /> : null}
        </Field>
        <Field label="Sells iPhones">
          <NativeSelect name="sells_iphones" defaultValue={triState(values.sells_iphones)}>
            <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
          </NativeSelect>
        </Field>
        <Field label="Sells refurbished">
          <NativeSelect name="sells_refurbished" defaultValue={triState(values.sells_refurbished)}>
            <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
          </NativeSelect>
        </Field>
        <Field label="Language for emails">
          <NativeSelect name="language" defaultValue={values.language ?? "en"}>
            <option value="en">English</option><option value="es">Spanish</option>
          </NativeSelect>
        </Field>
        <Field label="Source"><Input name="source" defaultValue={values.source ?? "manual"} /></Field>
        {team ? (
          <Field label="Owner">
            <NativeSelect name="owner_user_id" defaultValue="">
              <option value="">Me</option>
              {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
            </NativeSelect>
          </Field>
        ) : null}
        {showOptIns ? (
          <div className="grid gap-2 text-sm sm:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="whatsapp_opt_in" defaultChecked={values.whatsapp_opt_in} className="size-4" />
              Agreed to receive WhatsApp messages
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="email_opt_out" defaultChecked={values.email_opt_out} className="size-4" />
              Unsubscribed from emails (not sent to Brevo)
            </label>
          </div>
        ) : null}
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p> : null}
      {!disabled ? (
        <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button></div>
      ) : null}
    </form>
  );
}
