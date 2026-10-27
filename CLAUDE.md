# HKR System — instructions for Claude

Read this file and the brief section for the current phase at the start of every session.
Also read `AGENTS.md` (Next.js 16 notes: this Next.js differs from older training data — check
`node_modules/next/dist/docs/` before using an API).

## Project instructions (from the brief §5)

You are building the internal operations platform of HK Refurbished Stock (HKR), a Hong Kong B2B
wholesaler of Grade A+++ refurbished iPhones sold to resellers in Europe, Latin America and the US.
Gabriel is Director of Business Development. He is not a developer: explain every technical step in
plain words, one step at a time, and say exactly what to click or paste.

**Source of truth**
- The build brief ("HKR Internal System — Build Brief and Session Prompts") and the SOP
  (HKR_SOP_Account_Specialist_v1.5.docx) are in project knowledge. Business rules come from there.
  If they disagree, ask Gabriel.
- Never invent business rules, prices, fees or statuses. If something is missing, ask one precise question.

**Stack (do not change without asking)**
- Next.js (App Router, TypeScript), Tailwind, shadcn/ui.
- Supabase: Postgres, Auth, Row Level Security, Storage, Edge Functions, Realtime.
- Vercel for hosting. GitHub for the repo. Brevo for email. Meta WhatsApp Cloud API, called directly (no Wati, no BSP).
- Prefer boring, well-documented libraries. No extra paid services without asking.

**Way of working**
- One phase per session, in the order of the brief (§10).
- First propose a short plan (tables, screens, checks) as a compact markdown block of at most 40 lines;
  wait for Gabriel's OK, then implement.
- You do not see the planning conversations; the brief is the only shared context. If something is
  ambiguous, stop and ask one precise question and wait. Never guess a business rule.
- Security first: every table has RLS; roles are admin, bd, account_specialist; confidential finance
  fields (cost, margin, profit, engine parameters, company totals) are admin-only at the database
  level, not only hidden in the UI.
- Never run destructive migrations or delete data without asking. Never commit secrets; use
  environment variables and give only their names.
- Seed realistic demo data for every phase.
- Finish every phase with: a "How to verify" list for the browser, the updated CLAUDE.md, and a git
  commit per feature.
- UI language: English. Money: USD, with EUR shown where the EU partner invoice exists. Dates stored
  in UTC, shown in Hong Kong time and El Salvador time where it matters.
- Keep screens simple: tables with filters, a detail page per record, a status with a clear next
  action. Users are an account specialist, a BD manager and Gabriel — not engineers.

## Phase status

| Phase | Status |
| --- | --- |
| 0 Foundation | Built (Oct 2026): auth, roles, RLS helpers, audit log, settings, app shell, demo seed |
| 1 Leads | Built (Oct 2026): leads, My day, list, detail + timeline, Kanban, /apply form, importer, scoring settings, Brevo sync (inactive until BREVO_API_KEY) |
| 2 WhatsApp | Next |
| 3–7 | Not started |

## Folder layout

```
src/
  app/
    login/                 public sign-in page + server action
    (app)/                 everything behind login; layout.tsx = sidebar + header
      <module>/page.tsx    one folder per menu item (dashboard, accounts, orders, rmas,
                           price-lists, leads, whatsapp, settings)
    actions.ts             signOut
    apply/                 PUBLIC lead qualification form (EN/ES), uses the admin client
    api/cron/              Vercel Cron routes (need Authorization: Bearer CRON_SECRET)
    (app)/leads/           My day (page.tsx), list/, [id]/, board/, new/, import/, actions.ts
  components/
    ui/                    shadcn/ui components (generated; edit sparingly)
    shell/                 sidebar links, mobile menu, clocks, user menu
    no-access.tsx          "No access" page
    coming-soon.tsx        PageHeader + placeholder for modules not built yet
  lib/
    supabase/              server.ts (Server Components/Actions), client.ts (browser),
                           proxy.ts (session refresh), env.ts
    auth.ts                getCurrentUser(), checkSection(), requireRole()  ← the only auth entry points
    nav.ts                 SECTIONS: menu items, which roles see them, read-only roles, phase
    roles.ts               AppRole type and labels
    supabase/admin.ts      secret-key client: ONLY for /apply and cron jobs (bypasses RLS)
    leads/                 constants (stages, form options), countries (ISO + market), normalize,
                           scoring (pure, unit-tested), record (clean input → columns), import,
                           service (load settings/team), brevo-sync
    brevo.ts               Brevo REST client (no-op without BREVO_API_KEY)
    format.ts              dates in the viewer's time zone
  proxy.ts                 Next.js 16 "proxy" (formerly middleware): logged-out → /login
  types/database.ts        generated Supabase types (npm run db:types) — do not edit by hand
supabase/
  migrations/              one SQL file per change, never edited after it ran on the hosted project
  seed.sql                 demo data (safe on hosted project, no passwords)
  seed_local_users.sql     LOCAL ONLY: creates demo Auth users with password LocalDemo-2026!
  tests/database/          pgTAP tests (npm run test:db)
tests/e2e/roles.cjs        browser test per role (npm run test:e2e)
fixtures/                  (from Phase 3) real templates and sample files given by Gabriel
```

## Database conventions (must follow in every migration)

- Every new table: columns `created_at timestamptz`, `created_by uuid`, `updated_at timestamptz`,
  then `select public.setup_table('public.<table>');` (or `setup_table('public.<t>', '<pk column>')`
  when the key is not `id`). That turns on RLS and adds the `stamp_row` and `audit_row` triggers.
- Write explicit policies per action (select / insert / update / delete) with the helpers:
  - `public.is_staff()` — active user with any role
  - `public.is_admin()`
  - `public.can_see_finance()` — admin only today
  - `public.has_account_access(account_id)` — admin + account_specialist: all accounts; bd: accounts
    where they are `owner` in `account_assignments`
  - wrap helper calls as `(select public.is_admin())` in policies for performance.
- `anon` (logged-out) gets no table access. Public features (Phase 1 /apply form) go through server
  code with `SUPABASE_SECRET_KEY`, never through direct anon grants.
- **Confidential finance fields live in separate `<table>_finance` tables** (e.g. `orders_finance`
  with `order_id` PK, `base_cost_usd`, `margin_pct`), whose RLS is `can_see_finance()`. Never put
  cost/margin columns on a table other roles can read. Confidential settings use
  `settings.confidential = true`.
- `audit_log` is append-only (a trigger blocks update/delete/truncate); only admin reads it.
- After a migration, `select * from public.security_check();` must return zero rows (it lists tables
  without RLS, stamp/audit triggers, or with anon grants). The pgTAP test checks this too.
- Never edit a migration that already ran on the hosted project; add a new one.
- After changing the schema run `npm run db:types` and commit `src/types/database.ts`.

## App conventions

- Every page under `(app)` starts with `const access = await checkSection("<key>")` and returns
  `<NoAccess />` when not allowed. Server Actions start with `await requireRole([...])`.
  UI checks are convenience only; RLS is the real guard.
- Menu visibility and read-only roles are defined once in `src/lib/nav.ts`.
- Cache Components is OFF (`next.config.ts`): every page is per-user and rendered on request.
- Times: store UTC; display Hong Kong (`Asia/Hong_Kong`) and El Salvador (`America/El_Salvador`).

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | install dependencies |
| `npm run dev` | app on http://localhost:3000 (needs `.env.local`, see `.env.example`) |
| `npm run build` / `npm start` | production build / run it |
| `npm run lint` · `npm run typecheck` | code checks |
| `npm run db:start` · `npm run db:stop` | local Supabase in Docker |
| `npm run db:reset` | rebuild local database from migrations + seeds |
| `npm run db:types` | regenerate `src/types/database.ts` from the local database |
| `npm run test:db` | pgTAP security tests |
| `npm test` | unit tests (vitest: scoring, countries, phones) |
| `npm run test:e2e` | browser test per role (app running on :3000 against local Supabase) |
| `node tests/e2e/leads.cjs` | Phase 1 browser test (run right after `npm run db:reset`; it changes data) |

Docker in Claude's cloud workspace: start it with `dockerd > /tmp/dockerd.log 2>&1 &` before `db:start`.

## Environments and secrets

Environment variable names (values only in Vercel / `.env.local`, never in git or chat):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — used now
- `SUPABASE_SECRET_KEY` — server only: /apply form and cron jobs (form shows "not available" without it)
- `BREVO_API_KEY` — Brevo sync; everything Brevo is skipped while it is empty
- `CRON_SECRET` — any long random text; Vercel sends it to /api/cron/* (nightly 03:00 UTC)

Hosted: Supabase project `hkr-system` (East US, ref `vsaumxeuraxmmfyremus`), Vercel project `hkr-system`
in team "Hk Refurbished Stock" (Hobby plan), production URL https://hkr-system.vercel.app, linked to
GitHub `hkr-system/hkr-system` (push to `main` deploys). `SUPABASE_SECRET_KEY` is not set in Vercel yet. Migrations are applied to the hosted project by Gabriel pasting the file
into Supabase → SQL Editor → Run (until the Supabase CLI is linked).

Demo users (hosted: created by hand in Authentication → Users with Auto Confirm; roles set by seed.sql):
gabriel.demo@ (admin), yessica.demo@ (bd), arslan.demo@ (bd, no accounts), atreyi.demo@
(account_specialist) — all `@hk-refurbished-stock.com`.

## Decisions log

- Oct 2026: EU batch cutoff follows European summer time — always Friday 12:00 on the Amsterdam clock.
- Oct 2026: finance fields → separate `*_finance` tables (not column grants).
- Oct 2026: GitHub repo made PUBLIC (Gabriel's choice) so Vercel Hobby can deploy it; Gabriel accepted that
  default settings in migrations are visible. Never commit secrets, client data or real prices.
- Oct 2026: Phase 0 seeds four users including Arslan (bd, no accounts), per Gabriel's Phase 0 prompt.

## Leads rules (Phase 1, decided by Gabriel Oct 2026)

- Stages: New → Contacted → Replied → Qualified → Meeting → Sample/Proposal → Won → Lost (Lost needs a reason).
- /apply: Tier A (not disqualified) → Qualified; Tier B, C and disqualified → New. Disqualified leads are kept, flagged.
- No automatic owner (`settings.lead_owner_by_market` all empty); new submissions show in every BD user's My day.
- Target countries list starts EMPTY → max score 60 → no Tier A until Gabriel fills it in Settings.
- Form options: volume <100 / 100–399 / 400–999 / 1000+ (stored as lower bound 0/100/400/1000);
  business types in `src/lib/leads/constants.ts` incl. the 6 exclusions of brief §3 row 8.
- Merge key: email, then phone (E.164). Unique indexes enforce one lead per email and per phone.
  Form merge updates the lead with the new answers; imports only FILL EMPTY fields.
- Brevo: on create/stage/market/language change the lead goes to list `<Stage>-<Market>-<LANG>`
  (created automatically in Brevo folder "HKR System"); example.com / .test emails are never sent.
- "Replies waiting": stage Replied and no contact logged since entering Replied (Phase 2 adds WhatsApp).
- Market from country: Europe → EU, Latin America & Caribbean → LATAM, US + territories → US, rest → ROW.

## Open questions (ask before the phase that needs them)

- Which countries are "target countries" (+30)? Until filled in Settings, no lead reaches Tier A.
- Owner notification email for new form leads: needs an owner rule and the Brevo sender domain (SPF/DKIM).
- Phase 3: account owner — keep `accounts.owner_user_id` from the brief in sync with
  `account_assignments` (owner), or use assignments only?
