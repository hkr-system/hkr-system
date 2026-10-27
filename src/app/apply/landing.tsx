import Image from "next/image";
import { SegmentPicker } from "./segment-picker";
import type { Texts } from "./texts";

// Public landing sections above the form. Static: all copy lives in texts.ts.
// Layout: one mobile column (max 560px), light ground, navy type, red only on the action.

export function Eyebrow({ children, red }: { children: React.ReactNode; red?: boolean }) {
  return (
    <span className={`font-heading text-xs font-semibold uppercase tracking-[0.16em] ${red ? "text-hkr-action" : "text-hkr-accent"}`}>
      {children}
    </span>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-1 font-heading text-[clamp(26px,7vw,32px)] font-extrabold leading-[1.05] tracking-[-0.015em] text-balance">{children}</h2>;
}

export function Band({ children, alt, id }: { children: React.ReactNode; alt?: boolean; id?: string }) {
  return (
    <section id={id} className={`py-12 ${alt ? "bg-hkr-bg-2" : ""}`}>
      <div className="mx-auto grid max-w-[560px] gap-5 px-4">{children}</div>
    </section>
  );
}

export function CtaButton({ href, children, small }: { href: string; children: React.ReactNode; small?: boolean }) {
  return (
    <a
      href={href}
      className={`inline-flex w-full items-center justify-center rounded-xl bg-hkr-action font-heading font-extrabold text-white shadow-[0_8px_24px_rgba(214,25,46,.28)] transition-colors hover:bg-hkr-action-dark ${small ? "h-10 w-auto px-4 text-sm shadow-none" : "h-14 px-6 text-base"}`}
    >
      {children}
    </a>
  );
}

const CHIPS_PAY = "AAAAAAAAAA".split("");
const CHIPS_GET = ["A", "B", "A", "B", "A", "C", "A", "B", "C", "A"];

function Chip({ kind }: { kind: string }) {
  const bg = kind === "B" ? "bg-hkr-action" : kind === "C" ? "bg-[#8a94ad]" : "bg-[#3d5a9c]";
  return <i className={`grid size-[26px] place-items-center rounded-md font-heading text-[13px] font-black not-italic text-white ${bg}`}>{kind === "C" ? "B" : kind}</i>;
}

export function Landing({ t, formHref }: { t: Texts; formHref: string }) {
  return (
    <>
      {/* Hero */}
      <section className="bg-[radial-gradient(110%_60%_at_90%_0%,var(--hkr-accent-tint)_0%,var(--hkr-bg)_65%)] py-10">
        <div className="mx-auto grid max-w-[560px] gap-[18px] px-4">
          <span className="font-heading text-xs font-semibold uppercase tracking-[0.12em] text-hkr-muted">{t.hero.since}</span>
          <h1 className="font-heading text-[clamp(34px,9.6vw,54px)] font-black leading-[1.02] tracking-[-0.02em] text-balance [overflow-wrap:anywhere]">{t.hero.title}</h1>
          <span className="inline-block w-fit rounded-lg bg-hkr-red-tint px-3.5 py-2 font-heading text-base font-extrabold text-hkr-action-dark">{t.hero.pill}</span>
          <p className="max-w-[32ch] text-[19px] leading-snug text-hkr-ink-2">{t.hero.lead}</p>
          <CtaButton href={formHref}>{t.cta}</CtaButton>
          <p className="text-center text-sm text-hkr-muted">{t.hero.micro}</p>
          <Image src="/brand/photos/box-iphone15.jpg" alt={t.hero.photoAlt} width={1200} height={863} className="aspect-[16/11] w-full rounded-2xl border object-cover" priority />
          <div className="grid grid-cols-2 gap-2.5" data-tabular>
            {t.hero.stats.map((s) => (
              <div key={s.label} className="min-w-0 rounded-xl border bg-hkr-surface px-3.5 py-3">
                <b className="block font-heading text-2xl font-black leading-none">{s.value}</b>
                <span className="text-[13px] text-hkr-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Segment picker (micro-commitment) */}
      <Band>
        <div><Eyebrow>{t.segment.eyebrow}</Eyebrow><H2>{t.segment.title}</H2></div>
        <p className="text-hkr-ink-2">{t.segment.sub}</p>
        <SegmentPicker cards={t.segment.cards} pickLabel={t.segment.pick} formHref={formHref} />
      </Band>

      {/* Loss */}
      <Band alt>
        <div><Eyebrow red>{t.loss.eyebrow}</Eyebrow><H2>{t.loss.title}</H2></div>
        <div className="grid gap-3">
          <div className="rounded-2xl border bg-hkr-surface p-[18px]">
            <span className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-hkr-ink-2">{t.loss.payLabel}</span>
            <h3 className="mt-1 font-heading text-lg font-extrabold">{t.loss.payTitle}</h3>
            <div className="mt-2.5 flex flex-wrap gap-[5px]">{CHIPS_PAY.map((c, i) => <Chip key={i} kind={c} />)}</div>
          </div>
          <div className="rounded-2xl border bg-hkr-surface p-[18px]">
            <span className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-hkr-ink-2">{t.loss.getLabel}</span>
            <h3 className="mt-1 font-heading text-lg font-extrabold">{t.loss.getTitle}</h3>
            <div className="mt-2.5 flex flex-wrap gap-[5px]">{CHIPS_GET.map((c, i) => <Chip key={i} kind={c} />)}</div>
          </div>
        </div>
        <div className="grid gap-2">
          {t.loss.costs.map((c) => {
            const [b, ...rest] = c.split(". ");
            return (
              <div key={c} className="rounded-r-lg border-l-[3px] border-hkr-action bg-hkr-red-tint px-3 py-2 text-base">
                <b className="text-hkr-action-dark">{b}.</b> {rest.join(". ")}
              </div>
            );
          })}
        </div>
        <div className="grid gap-3.5 rounded-2xl border bg-hkr-surface p-[18px]">
          <div>
            <span className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-hkr-ink-2">{t.loss.cliffEyebrow}</span>
            <h3 className="mt-1 font-heading text-[21px] font-extrabold leading-tight text-balance">{t.loss.cliffTitle}</h3>
          </div>
          <div className="grid h-[170px] grid-cols-3 items-end gap-2.5" data-tabular>
            {t.loss.bars.map((b, i) => (
              <div key={b.value} className="grid h-full min-w-0 content-end gap-1.5">
                <b className="text-center font-heading text-xl font-black">{b.value}</b>
                <i className={`block rounded-t-lg ${i === 0 ? "bg-hkr-action" : i === 1 ? "bg-[#3d5a9c]" : "bg-hkr-ink"}`} style={{ height: ["62%", "78%", "100%"][i] }} />
                <span className="whitespace-pre-line text-center text-xs leading-tight text-hkr-ink-2">{b.label}</span>
              </div>
            ))}
          </div>
          <span className="w-fit rounded-lg bg-hkr-red-tint px-2.5 py-1.5 font-heading text-[15px] font-extrabold text-hkr-action-dark">{t.loss.delta}</span>
          <p className="text-xs text-hkr-ink-2">{t.loss.source}</p>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-3.5 rounded-2xl border bg-hkr-surface p-4">
          <b className="font-heading text-[40px] font-black leading-none">{t.loss.proofValue}</b>
          <div>
            <span className="text-[15px] text-hkr-ink-2">{t.loss.proofText}</span>
            <small className="mt-1 block text-xs text-hkr-muted">{t.loss.proofSource}</small>
          </div>
        </div>
      </Band>

      {/* Product */}
      <Band>
        <div><Eyebrow>{t.product.eyebrow}</Eyebrow><H2>{t.product.title}</H2></div>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { src: "/brand/photos/iphone12-row.jpg", w: 900, h: 1200 },
            { src: "/brand/photos/frames.jpg", w: 900, h: 1200 },
            { src: "/brand/photos/galaxy-s23.jpg", w: 913, h: 1200 },
          ].map((p, i) => (
            <figure key={p.src} className={`m-0 grid min-w-0 gap-1.5 ${i === 0 ? "col-span-2" : ""}`}>
              <Image src={p.src} alt={t.product.gallery[i].alt} width={p.w} height={p.h} className={`w-full rounded-2xl border object-cover ${i === 0 ? "aspect-[16/10]" : "aspect-[4/5]"}`} />
              <figcaption className="text-[13px] text-hkr-ink-2">{t.product.gallery[i].caption}</figcaption>
            </figure>
          ))}
        </div>
        <ul className="grid gap-2.5">
          {t.product.features.map((f) => (
            <li key={f} className="flex items-start gap-3 text-lg font-semibold">
              <span className="mt-[9px] size-3 shrink-0 rotate-45 rounded-[2px] bg-hkr-accent" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
        <div className="grid gap-1 rounded-xl border border-l-4 border-l-hkr-action bg-hkr-surface px-[18px] py-4">
          <b className="font-heading text-[34px] font-black leading-none text-hkr-action">{t.product.statValue}</b>
          <span className="text-[15px] text-hkr-ink-2">{t.product.statText}</span>
        </div>
        <CtaButton href={formHref}>{t.cta}</CtaButton>
      </Band>

      {/* Process timeline */}
      <Band alt>
        <div><Eyebrow>{t.process.eyebrow}</Eyebrow><H2>{t.process.title}</H2></div>
        <ol className="relative grid pl-[34px] before:absolute before:top-3.5 before:bottom-3.5 before:left-[11px] before:w-0.5 before:bg-[linear-gradient(var(--hkr-accent)_0_85%,var(--hkr-action))]">
          {t.process.steps.map((s, i) => {
            const kind = "kind" in s ? s.kind : undefined;
            return (
              <li key={s.h} className={`relative ${i === t.process.steps.length - 1 ? "" : "pb-[26px]"}`}>
                <span
                  className={`absolute top-1.5 -left-[30px] size-4 rounded-full border-[3px] ${kind === "out" ? "border-hkr-action bg-hkr-action" : kind === "in" ? "border-hkr-muted bg-hkr-bg-2" : "border-hkr-accent bg-hkr-bg-2"}`}
                  aria-hidden
                />
                <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.14em] text-hkr-muted">{s.k}</span>
                <h3 className={`mt-0.5 font-heading text-xl font-extrabold leading-tight ${kind === "out" ? "text-hkr-action-dark" : ""}`}>{s.h}</h3>
                {"p" in s ? <p className="mt-1 text-[15px] text-hkr-ink-2">{s.p}</p> : null}
                {"tags" in s ? (
                  <div className="mt-2 flex flex-wrap gap-[5px]">
                    {s.tags.map((tag) => <span key={tag} className="rounded-full border bg-hkr-surface px-2 py-0.5 text-xs text-hkr-ink-2">{tag}</span>)}
                  </div>
                ) : null}
                {"batt" in s ? (
                  <div className="mt-2 flex flex-wrap gap-2" data-tabular>
                    {s.batt.map(([label, val]) => (
                      <span key={label} className="rounded-lg border bg-hkr-surface px-2.5 py-1.5 text-[13px] text-hkr-ink-2">{label} <b className="text-hkr-ink">{val}</b></span>
                    ))}
                  </div>
                ) : null}
                {"yes" in s ? (
                  <div className="mt-2.5 grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <h4 className="mb-2 font-heading text-xs font-semibold uppercase tracking-[0.14em] text-hkr-accent">{s.yesTitle}</h4>
                      <ul className="grid gap-1.5 text-[15px]">{s.yes.map((x) => <li key={x}><span className="font-bold text-hkr-accent">✓ </span>{x}</li>)}</ul>
                    </div>
                    <div className="min-w-0">
                      <h4 className="mb-2 font-heading text-xs font-semibold uppercase tracking-[0.14em] text-hkr-action">{s.noTitle}</h4>
                      <ul className="grid gap-1.5 text-[15px]">{s.no.map((x) => <li key={x}><span className="font-bold text-hkr-action">✕ </span>{x}</li>)}</ul>
                    </div>
                  </div>
                ) : null}
                {"photoAlt" in s ? (
                  <Image src="/brand/photos/imei-label.jpg" alt={s.photoAlt} width={1200} height={900} className="mt-2.5 aspect-[16/10] w-full rounded-2xl border object-cover" />
                ) : null}
                {"drop" in s ? <div className="mt-2 flex items-center gap-1.5 text-[13px] text-hkr-action-dark"><span className="text-hkr-action">↳</span>{s.drop}</div> : null}
              </li>
            );
          })}
        </ol>
      </Band>

      {/* Path chart */}
      <Band>
        <div><Eyebrow>{t.path.eyebrow}</Eyebrow><H2>{t.path.title}</H2></div>
        <div className="rounded-2xl border bg-hkr-surface px-3.5 pt-4 pb-2.5">
          <PathChart t={t} />
          <p className="mt-1.5 text-center text-[13px] text-hkr-ink-2">{t.path.caption}</p>
        </div>
        <p className="text-hkr-ink-2">{t.path.sub}</p>
      </Band>
    </>
  );
}

function PathChart({ t }: { t: Texts }) {
  const xs = [90, 210, 330, 450];
  const ys = [216, 192, 120, 60];
  return (
    <svg viewBox="0 0 520 300" role="img" aria-label={t.path.ariaChart} className="block h-auto w-full max-w-full">
      <defs>
        <linearGradient id="hkr-path-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6192e" stopOpacity=".18" />
          <stop offset="1" stopColor="#d6192e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="#e6ebf5" strokeWidth="1">
        {[60, 120, 180, 240].map((y) => <line key={y} x1="40" y1={y} x2="500" y2={y} />)}
      </g>
      <g fontFamily="var(--font-heading), system-ui, sans-serif" fontSize="11" fill="#4b5a7c" textAnchor="end">
        <text x="34" y="64">100k</text><text x="34" y="124">75k</text><text x="34" y="184">50k</text><text x="34" y="244">25k</text>
      </g>
      <path d="M90 240 L90 216 L210 216 L210 192 L330 192 L330 120 L450 120 L450 60 L500 60 L500 240 Z" fill="url(#hkr-path-g)" />
      <g fill="#3d5a9c">
        <rect x="60" y="216" width="60" height="24" rx="4" /><rect x="180" y="192" width="60" height="48" rx="4" /><rect x="300" y="120" width="60" height="120" rx="4" />
      </g>
      <rect x="420" y="60" width="60" height="180" rx="4" fill="#d6192e" />
      <path d="M90 216 L210 192 L330 120 L450 60" fill="none" stroke="#0f1a33" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <g fill="#0f1a33">
        {xs.map((x, i) => <circle key={x} cx={x} cy={ys[i]} r={i === 3 ? 6 : 5} fill={i === 3 ? "#d6192e" : "#0f1a33"} />)}
      </g>
      <g fontFamily="var(--font-heading), system-ui, sans-serif" fontWeight="800" fontSize="15" fill="#0f1a33" textAnchor="middle">
        {t.path.points.map((p, i) => <text key={p.y} x={xs[i]} y={ys[i] - 12} fill={i === 3 ? "#d6192e" : "#0f1a33"}>{p.y}</text>)}
      </g>
      <line x1="40" y1="240" x2="500" y2="240" stroke="#0f1a33" strokeWidth="2" />
      <g fontFamily="var(--font-sans), system-ui, sans-serif" fontSize="13" fill="#0f1a33" textAnchor="middle" fontWeight="600">
        {t.path.points.map((p, i) => <text key={p.x} x={xs[i]} y="262">{p.x}</text>)}
      </g>
      <g fontFamily="var(--font-sans), system-ui, sans-serif" fontSize="11" fill="#4b5a7c" textAnchor="middle">
        {t.path.points.map((p, i) => <text key={p.sub} x={xs[i]} y="280">{p.sub}</text>)}
      </g>
    </svg>
  );
}
