"use client";

import { useActionState, useMemo, useState } from "react";
import { createAccount, updateAccount, type ActionState } from "@/app/(app)/accounts/actions";
import { suggestCode } from "@/lib/accounts/code";
import { countryOptions, marketForCountry } from "@/lib/leads/countries";
import {
  ACCOUNT_STATUS_LABEL, BILLING_ENTITY_LABEL, DELIVERY_SETUP_LABEL, PAYMENT_METHOD_LABEL,
  type AccountStatus, type BillingEntity, type DeliverySetup, type PaymentMethod,
} from "@/lib/orders/constants";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AccountValues = {
  id?: string; code?: string; name?: string; legal_name?: string | null; country?: string | null; market?: string | null;
  vat_eori?: string | null; billing_address?: string | null; company_ids?: string | null; billing_entity?: BillingEntity; intermediary_id?: string | null; payment_method?: PaymentMethod;
  delivery_setup?: DeliverySetup; invoice_format?: { battery_line_separate?: boolean; show_ce_text?: boolean; show_note?: boolean };
  status?: AccountStatus; language?: string; tier?: string | null; drive_folder_url?: string | null;
  whatsapp_group_note?: string | null; notes?: string | null; owner?: string | null; specialist?: string | null;
};

type Props = {
  mode: "new" | "edit";
  values?: AccountValues;
  intermediaries: { id: string; name: string }[];
  team: { user_id: string; full_name: string; role: string | null }[];
  isAdmin: boolean;
  lastCodeSeq: number;
};

function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Step({ n, title, description, children }: { n: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-hkr-ink text-xs text-white">{n}</span>{title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

export function AccountForm({ mode, values = {}, intermediaries, team, isAdmin, lastCodeSeq }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mode === "new" ? createAccount : updateAccount, {});
  const [name, setName] = useState(values.name ?? "");
  const [country, setCountry] = useState(values.country ?? "");
  const [codeTouched, setCodeTouched] = useState(mode === "edit");
  const [code, setCode] = useState(values.code ?? "");
  const [intermediary, setIntermediary] = useState(values.intermediary_id ?? "");
  const suggested = useMemo(() => suggestCode(name, country, lastCodeSeq), [name, country, lastCodeSeq]);
  const shownCode = codeTouched ? code : suggested;
  const market = marketForCountry(country);
  const fmt = values.invoice_format ?? { battery_line_separate: true };
  const countries = countryOptions("en");

  return (
    <form action={action} className="grid gap-4" data-testid="account-form">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <Step n={1} title="Client and code" description="SOP §2.1: three letters of the client's name, ISO-2 country of the invoiced entity, next free number. A code is never reused.">
        <Field label="Client name *"><Input name="name" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Legal name of the invoiced entity"><Input name="legal_name" defaultValue={values.legal_name ?? ""} /></Field>
        <Field label="Country of the invoiced entity *" hint={market ? `Market: ${market}` : undefined}>
          <NativeSelect name="country" required value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Choose…</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Client code *" hint={mode === "new" ? "Suggested from the name, country and the client list; you can change the letters." : isAdmin ? "Only an admin changes a code." : "Only an admin changes a code."}>
          <Input name="code" required value={shownCode} readOnly={mode === "edit" && !isAdmin}
            onChange={(e) => { setCodeTouched(true); setCode(e.target.value.toUpperCase()); }}
            className="font-mono uppercase" data-testid="account-code" />
        </Field>
        <Field label="VAT / EORI (EU)"><Input name="vat_eori" defaultValue={values.vat_eori ?? ""} /></Field>
        <Field label="Address of the invoiced entity" hint="One line each, as it goes on the invoice (street, city + postcode, country)." className="sm:col-span-2">
          <Textarea name="billing_address" rows={3} defaultValue={values.billing_address ?? ""} placeholder={"Street and number\nPostcode City, Region\nCountry"} />
        </Field>
        <Field label="Other company IDs on the invoice" hint="Optional, one per line (e.g. EIN: …, NIT: …, KVK/CoC: …)." className="sm:col-span-2">
          <Textarea name="company_ids" rows={2} defaultValue={values.company_ids ?? ""} />
        </Field>
        {mode === "edit" ? (
          <Field label="Status">
            <NativeSelect name="status" defaultValue={values.status ?? "onboarding"}>
              {Object.entries(ACCOUNT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </NativeSelect>
          </Field>
        ) : null}
      </Step>

      <Step n={2} title="Invoicing and payment" description="Brief §6: EU accounts via an intermediary pay EUR to the intermediary; everyone else pays USD to Hong Kong.">
        <Field label="Billing entity">
          <NativeSelect name="billing_entity" defaultValue={values.billing_entity ?? "ever_state"}>
            {Object.entries(BILLING_ENTITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Route" hint={intermediary ? "Route B: the client pays EUR (intermediary invoice)." : "Direct: the client pays USD."}>
          <NativeSelect name="intermediary_id" value={intermediary} onChange={(e) => setIntermediary(e.target.value)} data-testid="intermediary">
            <option value="">Direct (no intermediary)</option>
            {intermediaries.map((i) => <option key={i.id} value={i.id}>Via {i.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Payment method">
          <NativeSelect name="payment_method" defaultValue={values.payment_method ?? "wire"}>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Invoice format">
          <div className="grid gap-1.5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="battery_line_separate" defaultChecked={fmt.battery_line_separate ?? true} className="size-4" /> Separate “New battery cell” line (otherwise absorbed in the price)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="show_ce_text" defaultChecked={fmt.show_ce_text ?? false} className="size-4" /> Show CE text</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="show_note" defaultChecked={fmt.show_note ?? false} className="size-4" /> Show note</label>
          </div>
        </Field>
      </Step>

      <Step n={3} title="Delivery, team and records">
        <Field label="Delivery set-up (default for new orders)">
          <NativeSelect name="delivery_setup" defaultValue={values.delivery_setup ?? "client_label"}>
            {Object.entries(DELIVERY_SETUP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Language">
          <NativeSelect name="language" defaultValue={values.language ?? "en"}>
            <option value="en">English</option><option value="es">Spanish</option>
          </NativeSelect>
        </Field>
        {isAdmin ? (
          <>
            <Field label="Owner (BD)" hint="The owner's accounts are the only ones a BD user sees.">
              <NativeSelect name="owner_user_id" defaultValue={values.owner ?? ""} data-testid="owner">
                <option value="">No owner yet</option>
                {team.filter((t) => t.role !== "account_specialist").map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Account specialist">
              <NativeSelect name="specialist_user_id" defaultValue={values.specialist ?? ""}>
                <option value="">Not assigned</option>
                {team.filter((t) => t.role === "account_specialist").map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
              </NativeSelect>
            </Field>
          </>
        ) : (
          <p className="text-xs text-muted-foreground sm:col-span-2">An admin assigns the owner and the specialist.</p>
        )}
        <Field label="Drive folder (legacy documents)"><Input name="drive_folder_url" type="url" defaultValue={values.drive_folder_url ?? ""} placeholder="https://drive.google.com/…" /></Field>
        <Field label="Client WhatsApp group"><Input name="whatsapp_group_note" defaultValue={values.whatsapp_group_note ?? ""} placeholder="Group name / who is in it" /></Field>
        <Field label="Tier"><Input name="tier" defaultValue={values.tier ?? ""} placeholder="optional" /></Field>
        <Field label="Account Notes" className="sm:col-span-2" hint="SOP §2.5: route and delivery set-up, forwarder, who confirms orders and payments, agreed exceptions with date and who approved.">
          <Textarea name="notes" rows={4} defaultValue={values.notes ?? ""} />
        </Field>
      </Step>

      {mode === "new" ? (
        <Step n={4} title="First contact" description="Who confirms orders or payments on the client side. More contacts can be added later.">
          <Field label="Name"><Input name="contact_name" /></Field>
          <Field label="Role"><Input name="contact_role" placeholder="e.g. Confirms orders" /></Field>
          <Field label="WhatsApp / phone"><Input name="contact_phone" placeholder="+31 6 1234 5678" /></Field>
          <Field label="Email"><Input name="contact_email" type="email" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="contact_opt_in" className="size-4" /> Agreed to receive WhatsApp messages</label>
        </Step>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : mode === "new" ? "Create account" : "Save changes"}</Button>
        {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
        {state.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
      </div>
    </form>
  );
}
