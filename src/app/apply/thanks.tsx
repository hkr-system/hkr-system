"use client";

import { useState } from "react";
import { T, type Lang, type Texts } from "./texts";

// Thank-you view after the form: agent contact (prices only in a call), welcome kit, order terms.
export function ThanksView({ lang, reference, firstName, company, country, whatsapp, disqualified }: {
  lang: Lang; reference: string; firstName: string; company: string; country: string; whatsapp: string | null; disqualified: boolean;
}) {
  const t = T[lang];
  const th = t.thanks;
  const digits = (whatsapp ?? "").replace(/\D/g, "");
  const waHref = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(th.waMessage(firstName, company, country, reference))}` : null;
  const showAgent = !disqualified && Boolean(waHref);

  return (
    <div className="-mx-4" data-testid="apply-done">
      <section className="bg-[radial-gradient(110%_60%_at_90%_0%,var(--hkr-accent-tint)_0%,var(--hkr-bg)_65%)] py-9">
        <div className="mx-auto grid max-w-[560px] gap-3.5 px-4">
          <span className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-hkr-accent">{th.eyebrow}</span>
          <h1 className="font-heading text-[clamp(32px,9vw,44px)] font-black leading-[1.02] tracking-[-0.02em]">{th.title(firstName)}</h1>
          <p className="max-w-[32ch] text-[19px] leading-snug text-hkr-ink-2">{disqualified ? th.leadDq : th.lead}</p>
          <span className="inline-flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1.5 font-heading text-[13px] font-semibold uppercase tracking-[0.1em] text-hkr-muted">
            {th.reference} <b className="tracking-[0.04em] text-hkr-ink" data-testid="apply-ref">{reference}</b>
          </span>
        </div>
      </section>

      {showAgent ? (
        <section className="py-10">
          <div className="mx-auto max-w-[560px] px-4">
            <AgentBox t={t} whatsapp={whatsapp!} waHref={waHref!} />
          </div>
        </section>
      ) : disqualified ? (
        <section className="py-10">
          <div className="mx-auto max-w-[560px] px-4">
            <div className="grid gap-2 rounded-2xl border bg-hkr-surface p-[18px]">
              <h3 className="font-heading text-lg font-extrabold">{th.dqTitle}</h3>
              <p className="text-hkr-ink-2">{th.dqText}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg-hkr-bg-2 py-12">
        <div className="mx-auto grid max-w-[560px] gap-4 px-4">
          <div>
            <span className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-hkr-accent">{th.kitEyebrow}</span>
            <h2 className="mt-1 font-heading text-[clamp(26px,7vw,32px)] font-extrabold leading-[1.05]">{th.kitTitle}</h2>
          </div>
          <div className="grid gap-3">
            {th.kit.map((k, i) => (
              <div key={k.h} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border bg-hkr-surface p-[18px]">
                <div>
                  <b className="block font-heading text-lg font-extrabold">{k.h}</b>
                  <span className="text-sm text-hkr-ink-2">{k.p}</span>
                </div>
                {i === 3 ? (
                  <a href="#terms" className="whitespace-nowrap rounded-[9px] border-2 border-hkr-ink px-3 py-2 font-heading text-sm font-extrabold text-hkr-ink">{k.a}</a>
                ) : (
                  <KitButton label={k.a} soon={th.kitSoon} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="terms" className="py-12">
        <div className="mx-auto grid max-w-[560px] gap-4 px-4">
          <div>
            <span className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-hkr-accent">{th.termsEyebrow}</span>
            <h2 className="mt-1 font-heading text-[clamp(26px,7vw,32px)] font-extrabold leading-[1.05]">{th.termsTitle}</h2>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-hkr-surface" data-tabular>
            {th.terms.map(([k, v, note]) => (
              <div key={k} className="grid grid-cols-[1fr_auto] gap-3 border-b px-3.5 py-3 text-base last:border-b-0">
                <span>{k}{note ? <><br /><small className="text-hkr-muted">{note}</small></> : null}</span>
                <b className="text-right font-heading font-extrabold">{v}</b>
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            {th.flow.map(([h, p], i) => (
              <div key={h}>
                <div className={`rounded-[10px] border px-3.5 py-3 font-semibold ${i === th.flow.length - 1 ? "border-hkr-action bg-hkr-red-tint" : "bg-hkr-surface"}`}>
                  {h}<small className={`block text-sm font-normal ${i === th.flow.length - 1 ? "text-hkr-action-dark" : "text-hkr-muted"}`}>{p}</small>
                </div>
                {i < th.flow.length - 1 ? <div className="py-1 text-center text-lg leading-none text-hkr-accent" aria-hidden>↓</div> : null}
              </div>
            ))}
          </div>
          {showAgent ? (
            <a href={waHref!} target="_blank" rel="noopener" className="flex h-14 items-center justify-center rounded-xl bg-[#1f9d55] font-heading text-base font-extrabold text-white">{th.agentButton2}</a>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AgentBox({ t, whatsapp, waHref }: { t: Texts; whatsapp: string; waHref: string }) {
  const th = t.thanks;
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3.5 rounded-[18px] border bg-hkr-surface px-[18px] py-[22px]">
      <span className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-hkr-accent">{th.agentEyebrow}</span>
      <h3 className="font-heading text-2xl font-extrabold leading-tight">{th.agentTitle}</h3>
      <p className="text-hkr-ink-2">{th.agentText}</p>
      <a href={waHref} target="_blank" rel="noopener" className="flex h-14 items-center justify-center rounded-xl bg-[#1f9d55] font-heading text-base font-extrabold text-white" data-testid="apply-whatsapp">{th.agentButton}</a>
      <div className="flex items-center justify-between gap-2.5 rounded-[10px] border-[1.5px] border-[#c9d3ea] px-3.5 py-2.5 font-heading text-lg font-bold" data-tabular>
        <span>{whatsapp}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(whatsapp).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
          }}
          className="rounded-lg bg-hkr-bg px-3 py-2 text-sm font-bold text-hkr-accent"
        >
          {copied ? th.copied : th.copy}
        </button>
      </div>
    </div>
  );
}

function KitButton({ label, soon }: { label: string; soon: string }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { setShown(true); setTimeout(() => setShown(false), 1800); }}
      className="whitespace-nowrap rounded-[9px] border-2 border-hkr-ink px-3 py-2 font-heading text-sm font-extrabold text-hkr-ink"
    >
      {shown ? soon : label}
    </button>
  );
}
