"use client";

import { useState } from "react";

export const SEGMENT_EVENT = "hkr:segment";

type Card = { key: string; label: string; range: string; volume: string; items: readonly string[] };

const ICONS: Record<string, React.ReactNode> = {
  small: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H7" /><circle cx="9.5" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" />
    </svg>
  ),
  medium: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10l1.5-5h15L21 10" /><path d="M3 10a2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5 0" /><path d="M5 12v8h14v-8" /><path d="M10 20v-5h4v5" />
    </svg>
  ),
  large: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21h18" /><path d="M5 21V7l5-3v17" /><path d="M10 21V11l6-3v13" /><path d="M16 21V13l4 2v6" /><path d="M7 10h1M7 13h1M7 16h1M12.5 13h1M12.5 16h1" />
    </svg>
  ),
};

// "Where is your business today?" — tapping a card preselects the volume range in the form
// (a small first commitment) and scrolls down to it.
export function SegmentPicker({ cards, pickLabel, formHref }: { cards: readonly Card[]; pickLabel: string; formHref: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-pressed={picked === c.key}
          data-testid={`segment-${c.key}`}
          onClick={() => {
            setPicked(c.key);
            window.dispatchEvent(new CustomEvent(SEGMENT_EVENT, { detail: { volume: c.volume, segment: c.key } }));
            document.querySelector(formHref)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="grid gap-1.5 rounded-2xl border-2 bg-hkr-surface p-4 text-left text-hkr-ink transition-colors aria-pressed:border-hkr-ink aria-pressed:bg-hkr-accent-tint focus-visible:outline-3 focus-visible:outline-hkr-accent"
        >
          <span className="mb-1 grid size-10 place-items-center rounded-xl bg-hkr-accent-tint text-hkr-accent">{ICONS[c.key]}</span>
          <b className="font-heading text-[22px] font-black leading-tight">
            <small className="mr-2 font-heading text-[13px] font-semibold uppercase tracking-[0.1em] text-hkr-muted">{c.label}</small>
            {c.range}
          </b>
          <ul className="columns-2 gap-4 pl-[18px] text-[15px] text-hkr-ink-2 [&>li]:break-inside-avoid">
            {c.items.map((i) => <li key={i} className="list-disc">{i}</li>)}
          </ul>
          <span className="font-heading text-sm font-bold text-hkr-accent">{pickLabel}</span>
        </button>
      ))}
    </div>
  );
}
