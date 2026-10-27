"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { BUSINESS_TYPES, HEARD_ABOUT, VOLUME_RANGES } from "@/lib/leads/constants";
import { submitApplication, type ApplyState } from "./actions";
import { SEGMENT_EVENT } from "./segment-picker";
import { ThanksView } from "./thanks";
import { T, type Lang } from "./texts";

type Country = { code: string; name: string };
type Tracking = { src: string | null; ref: string | null; utm: Record<string, string> };

const DRAFT_KEY = "hkr_apply_draft";
const STEP_FIELDS: Record<number, string[]> = {
  0: ["company", "country", "city"],
  1: ["business_type", "sells_iphones", "sells_refurbished", "volume_range", "heard_about", "heard_other"],
  2: ["contact_name", "title", "phone_national", "email"],
};

function flag(iso: string) {
  if (iso.length !== 2) return "";
  return String.fromCodePoint(...iso.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

function Field({ id, label, hint, error, children }: { id?: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5" data-error={error ? "" : undefined}>
      <label htmlFor={id} className="text-[15px] font-bold">
        {label} {hint ? <small className="font-normal text-hkr-ink-2">{hint}</small> : null}
      </label>
      {children}
      {error ? <span className="text-sm text-hkr-action" role="alert">{error}</span> : null}
    </div>
  );
}

const inputClass = "h-[50px] rounded-[10px] border-[1.5px] border-[#c9d3ea] bg-white px-3.5 text-[17px] text-hkr-ink placeholder:text-[#8f9bb8] focus-visible:ring-3 focus-visible:ring-hkr-accent/40 data-[error]:border-hkr-action";
const selectClass = "h-[50px] rounded-[10px] border-[1.5px] border-[#c9d3ea] bg-white px-3.5 text-[17px] text-hkr-ink";

function YesNo({ name, yes, no, checked, onChange }: { name: string; yes: string; no: string; checked: string | null; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[["yes", yes], ["no", no]].map(([v, label]) => (
        <label key={v} className={`flex min-h-[50px] cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] px-2 text-center font-semibold ${checked === v ? "border-hkr-ink bg-hkr-accent-tint text-hkr-ink" : "border-[#c9d3ea]"}`}>
          <input type="radio" name={name} value={v} checked={checked === v} onChange={() => onChange(v)} className="sr-only" />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

export function ApplyForm({ lang, countries, tracking, whatsappFallback }: {
  lang: Lang; countries: Country[]; tracking: Tracking; whatsappFallback: string | null;
}) {
  const t = T[lang];
  const f = t.form;
  const [state, action, pending] = useActionState<ApplyState, FormData>(submitApplication, {});
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [country, setCountry] = useState("");
  const [dial, setDial] = useState("+57");
  const [heard, setHeard] = useState("");
  const [iphones, setIphones] = useState<string | null>(null);
  const [refurb, setRefurb] = useState<string | null>(null);
  const [volume, setVolume] = useState("");
  const [segment, setSegment] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const dialCodes = getCountries()
    .filter((iso) => countries.some((c) => c.code === iso))
    .map((iso) => ({ iso, code: `+${getCountryCallingCode(iso)}`, name: countries.find((c) => c.code === iso)!.name }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));

  // Draft kept in this browser only (per-viewer convenience); cleared on submit.
  useEffect(() => {
    // Restored after hydration (next tick), so the server-rendered form and the first client render match.
    const timer = setTimeout(() => { try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") as Record<string, string>;
      const form = formRef.current;
      if (!form) return;
      for (const [k, v] of Object.entries(d)) {
        const el = form.elements.namedItem(k);
        if (el instanceof HTMLInputElement && el.type !== "radio" && el.type !== "checkbox" && el.type !== "hidden") el.value = v;
      }
      if (d.country) setCountry(d.country);
      if (d.dial_code) setDial(d.dial_code);
      if (d.heard_about) setHeard(d.heard_about);
      if (d.sells_iphones) setIphones(d.sells_iphones);
      if (d.sells_refurbished) setRefurb(d.sells_refurbished);
      if (d.volume_range) setVolume(d.volume_range);
      if (d.business_type) (form.elements.namedItem("business_type") as HTMLSelectElement).value = d.business_type;
    } catch { /* storage unavailable */ } }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onSegment = (e: Event) => {
      const { volume: v, segment: s } = (e as CustomEvent<{ volume: string; segment: string }>).detail;
      setVolume(v); setSegment(s);
    };
    window.addEventListener(SEGMENT_EVENT, onSegment);
    return () => window.removeEventListener(SEGMENT_EVENT, onSegment);
  }, []);

  function save() {
    const form = formRef.current;
    if (!form) return;
    const d: Record<string, string> = {};
    new FormData(form).forEach((v, k) => { if (typeof v === "string" && !["lang", "src", "ref", "utm", "fax"].includes(k)) d[k] = v; });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }

  function validate(s: number): boolean {
    const form = formRef.current!;
    const fd = new FormData(form);
    const val = (k: string) => String(fd.get(k) ?? "").trim();
    const e: Record<string, string> = {};
    for (const k of STEP_FIELDS[s]) {
      const v = val(k);
      if (k === "country" && !v) e[k] = f.errors.country;
      else if (k === "heard_other") { if (val("heard_about") === "other" && !v) e[k] = f.errors.heardOther; }
      else if (k === "email") { if (!v) e[k] = f.errors.required; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) e[k] = f.errors.email; }
      else if (k === "phone_national") { if (v.replace(/\D/g, "").length < 6) e[k] = f.errors.phone; }
      else if (["business_type", "volume_range", "heard_about", "sells_iphones", "sells_refurbished"].includes(k)) { if (!v) e[k] = f.errors.choose; }
      else if (k === "title" || k === "city") { /* optional */ }
      else if (!v) e[k] = f.errors.required;
    }
    setErrors(e);
    if (Object.keys(e).length) {
      const first = form.querySelector<HTMLElement>(`[name="${Object.keys(e)[0]}"]`);
      first?.focus();
      return false;
    }
    return true;
  }

  function go(next: number) {
    setStep(next);
    document.getElementById("aplicar")?.scrollIntoView({ block: "start" });
  }

  useEffect(() => {
    if (state.done) {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      // The thank-you page takes over: landing, form intro and the floating button go away.
      for (const id of ["landing", "apply-intro"]) { const el = document.getElementById(id); if (el) el.hidden = true; }
      document.querySelector<HTMLElement>("[data-testid=sticky-cta]")?.remove();
      window.scrollTo(0, 0);
    }
  }, [state.done]);

  if (state.done) {
    return (
      <ThanksView
        lang={lang}
        reference={state.ref ?? ""}
        firstName={state.firstName ?? ""}
        company={state.company ?? ""}
        country={state.country ?? ""}
        whatsapp={state.whatsapp ?? whatsappFallback}
        disqualified={Boolean(state.disqualified)}
      />
    );
  }

  const err = (k: string) => errors[k];

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      onInput={save}
      onChange={save}
      onSubmit={(e) => { if (!validate(2)) e.preventDefault(); }}
      className="grid gap-4 rounded-[18px] border bg-white p-[18px] pt-[22px] text-hkr-ink shadow-[0_10px_30px_rgba(15,26,51,.08)]"
      data-testid="apply-form"
    >
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="src" value={tracking.src ?? ""} />
      <input type="hidden" name="ref" value={tracking.ref ?? ""} />
      <input type="hidden" name="utm" value={JSON.stringify(tracking.utm)} />
      <input type="hidden" name="segment" value={segment} />
      {/* honeypot: hidden from people, tempting for bots */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Fax <input name="fax" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <span className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-hkr-action">{f.stepOf(step + 1)} · {f.steps[step]}</span>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => <i key={i} className={`block h-[5px] rounded-[3px] ${i <= step ? "bg-hkr-action" : "bg-[#dbe3f2]"}`} />)}
      </div>

      {/* Step 1 */}
      <div className="grid gap-4" hidden={step !== 0}>
        <h3 className="font-heading text-2xl font-extrabold">{f.steps[0]}</h3>
        <Field id="company" label={f.company} error={err("company")}>
          <Input id="company" name="company" autoComplete="organization" placeholder={f.companyPh} className={inputClass} data-error={err("company") ? "" : undefined} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field id="country" label={f.country} error={err("country")}>
            <NativeSelect id="country" name="country" value={country} onChange={(e) => {
              setCountry(e.target.value);
              const code = e.target.value;
              if (code && getCountries().includes(code as never)) setDial(`+${getCountryCallingCode(code as never)}`);
            }} className={selectClass}>
              <option value="">{f.choose}</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field id="city" label={f.city}>
            <Input id="city" name="city" autoComplete="address-level2" placeholder={f.cityPh} className={inputClass} />
          </Field>
        </div>
        <Field id="website" label={f.website} hint={f.optional}>
          <Input id="website" name="website" inputMode="url" placeholder={f.websitePh} className={inputClass} />
        </Field>
        <div className="mt-1.5 grid grid-cols-[1fr_2fr] gap-2.5">
          <span />
          <button type="button" onClick={() => validate(0) && go(1)} className="h-14 rounded-xl bg-hkr-action font-heading text-base font-extrabold text-white" data-testid="apply-next">{f.next}</button>
        </div>
      </div>

      {/* Step 2 */}
      <div className="grid gap-4" hidden={step !== 1}>
        <h3 className="font-heading text-2xl font-extrabold">{f.steps[1]}</h3>
        <Field id="business_type" label={f.businessType} error={err("business_type")}>
          <NativeSelect id="business_type" name="business_type" defaultValue="" className={selectClass}>
            <option value="">{f.choose}</option>
            {BUSINESS_TYPES.map((b) => <option key={b.value} value={b.value}>{b[lang]}</option>)}
          </NativeSelect>
        </Field>
        <Field label={f.sellsIphones} error={err("sells_iphones")}>
          <YesNo name="sells_iphones" yes={f.yes} no={f.notYet} checked={iphones} onChange={setIphones} />
        </Field>
        <Field label={f.sellsRefurbished} error={err("sells_refurbished")}>
          <YesNo name="sells_refurbished" yes={f.yes} no={f.no} checked={refurb} onChange={setRefurb} />
        </Field>
        <Field id="volume_range" label={f.volume} hint={f.approx} error={err("volume_range")}>
          <NativeSelect id="volume_range" name="volume_range" value={volume} onChange={(e) => setVolume(e.target.value)} className={selectClass}>
            <option value="">{f.choose}</option>
            {VOLUME_RANGES.map((v) => <option key={v.value} value={v.value}>{v[lang]}</option>)}
          </NativeSelect>
        </Field>
        <Field id="heard_about" label={f.heard} error={err("heard_about")}>
          <NativeSelect id="heard_about" name="heard_about" value={heard} onChange={(e) => setHeard(e.target.value)} className={selectClass}>
            <option value="">{f.choose}</option>
            {HEARD_ABOUT.map((o) => <option key={o.value} value={o.value}>{o[lang]}</option>)}
          </NativeSelect>
        </Field>
        <div hidden={heard !== "other"}>
          <Field id="heard_other" label={f.heardOther} error={err("heard_other")}>
            <Input id="heard_other" name="heard_other" placeholder={f.heardOtherPh} className={inputClass} />
          </Field>
        </div>
        <div className="mt-1.5 grid grid-cols-[1fr_2fr] gap-2.5">
          <button type="button" onClick={() => go(0)} className="h-14 rounded-xl border-2 border-[#c9d3ea] font-heading text-base font-extrabold text-hkr-ink">{f.back}</button>
          <button type="button" onClick={() => validate(1) && go(2)} className="h-14 rounded-xl bg-hkr-action font-heading text-base font-extrabold text-white" data-testid="apply-next">{f.next}</button>
        </div>
      </div>

      {/* Step 3 */}
      <div className="grid gap-4" hidden={step !== 2}>
        <h3 className="font-heading text-2xl font-extrabold">{f.steps[2]}</h3>
        <p className="text-[15px] text-hkr-ink-2">{f.hint3}</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Field id="contact_name" label={f.name} error={err("contact_name")}>
            <Input id="contact_name" name="contact_name" autoComplete="given-name" placeholder={f.namePh} className={inputClass} />
          </Field>
          <Field id="title" label={f.role}>
            <Input id="title" name="title" autoComplete="organization-title" placeholder={f.rolePh} className={inputClass} />
          </Field>
        </div>
        <Field id="phone_national" label={f.whatsapp} error={err("phone_national")}>
          <div className="grid grid-cols-[minmax(0,46%)_1fr] gap-2">
            <NativeSelect name="dial_code" aria-label={f.dialCode} value={dial} onChange={(e) => setDial(e.target.value)} className={`${selectClass} overflow-hidden text-ellipsis whitespace-nowrap`}>
              {dialCodes.map((d) => <option key={d.iso} value={d.code}>{flag(d.iso)} {d.code} {d.name}</option>)}
            </NativeSelect>
            <Input id="phone_national" name="phone_national" inputMode="tel" autoComplete="tel-national" placeholder={f.phonePh} className={inputClass} />
          </div>
        </Field>
        <Field id="email" label={f.email} error={err("email")}>
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" placeholder={f.emailPh} className={inputClass} />
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-hkr-ink-2">
          <input type="checkbox" name="whatsapp_opt_in" defaultChecked className="mt-0.5 size-5 shrink-0 accent-hkr-ink" /> {f.optIn}
        </label>
        {state.error ? <p role="alert" className="text-sm text-hkr-action">{state.error}</p> : null}
        <div className="mt-1.5 grid grid-cols-[1fr_2fr] gap-2.5">
          <button type="button" onClick={() => go(1)} className="h-14 rounded-xl border-2 border-[#c9d3ea] font-heading text-base font-extrabold text-hkr-ink">{f.back}</button>
          <button type="submit" disabled={pending} className="h-14 rounded-xl bg-hkr-action font-heading text-base font-extrabold text-white disabled:opacity-60">{pending ? f.sending : f.submit}</button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-hkr-ink-2">
          {f.assure.map(([b, s]) => (
            <div key={b} className="border-t-2 border-[#e6ebf5] pt-2"><b className="block font-heading text-[13px] text-hkr-ink">{b}</b>{s}</div>
          ))}
        </div>
      </div>
    </form>
  );
}
