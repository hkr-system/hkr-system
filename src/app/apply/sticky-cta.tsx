"use client";

import { useEffect, useState } from "react";

// Fixed bottom button that hides while the form is on screen.
export function StickyCta({ formHref, children }: { formHref: string; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = document.querySelector(formHref);
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => setHidden(entries[0].isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [formHref]);
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-20 bg-[linear-gradient(to_top,var(--hkr-bg)_70%,transparent)] px-4 pt-3.5 pb-[calc(12px+env(safe-area-inset-bottom,0px))] transition-[transform,opacity] duration-200 ${hidden ? "pointer-events-none translate-y-full opacity-0" : ""}`}
      data-testid="sticky-cta"
    >
      <a href={formHref} className="mx-auto flex h-14 max-w-[528px] items-center justify-center rounded-xl bg-hkr-action px-6 font-heading text-base font-extrabold text-white shadow-[0_8px_24px_rgba(214,25,46,.28)]">
        {children}
      </a>
    </div>
  );
}
