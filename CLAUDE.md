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
| 2 WhatsApp | Built (Oct 2026): webhook Edge Function, inbox (realtime, 24h window, templates, files, assignment), templates sync, numbers admin, broadcasts (bd drafts / admin approves, throttled worker), notifications, leads overview dashboard, collapsible menu, resizable columns |
| Brand + /apply landing | Built (Oct 27 2026): HKR brand tokens and fonts on every screen, logo, /settings/brand check page, /apply rebuilt as a conversion landing (3-step form, thank-you page), Leads → "Share form" |
| 3 Accounts, orders, payments | Built (Oct 27 2026) except invoices: accounts + wizard, contacts, orders, payments, shipping checklist + IMEI master, files. Invoice PDF/xlsx waits for the fixture invoices |
| Dashboards (pulled forward, Oct 27 2026) | Sales dashboard (/sales), Accounts overview with health (/accounts), Finance (/finance: goals, history, projection), red counters in the menu |
| 4 RMAs + client portal | Built (Oct 27 2026), live Oct 28 (migration + demo seeds on hosted): RMAs (IMEI check, evidence, approval, 1 % cap), xlsx form import, EU Friday batches (Excel + email), credit notes (PDF/xlsx), defect analytics, client portal /portal (EN/ES) |
| Sales KPIs + sales mix (Oct 27 2026) | Orders made/paid/pending, to collect, processing time, cash cycle, average order (also per account); /sales/mix |
| 5–7 | Not started (Phase 5 sales mix partly pulled forward) |

## Folder layout

```
src/
  app/
    login/                 public sign-in page + server action
    (app)/                 everything behind login; layout.tsx = sidebar + header
      <module>/page.tsx    one folder per menu item (dashboard, accounts, orders, rmas,
                           price-lists, leads, whatsapp, settings)
    actions.ts             signOut
    apply/                 PUBLIC landing + 3-step qualification form (EN/ES): page.tsx (tracking src/ref/utm),
                           landing.tsx (sections), apply-form.tsx, thanks.tsx, texts.ts (all copy), actions.ts
    api/cron/              Vercel Cron routes (need Authorization: Bearer CRON_SECRET)
    (app)/leads/           Overview dashboard (page.tsx), my-day/, list/, [id]/, board/, new/, import/, actions.ts
    (app)/whatsapp/        inbox (page.tsx, ?c=<conversation>), broadcasts/, templates/, numbers/, actions.ts
    (app)/sales/           Sales dashboard (menu "Sales" = section key "orders"; order pages stay under /orders); mix/ = sales mix
    (app)/rmas/            list (page.tsx), [id]/, new/ (typed or xlsx form import), batches/ (EU Friday batch), credit-notes/ (list, [id], new),
                           analytics/ (admin), actions.ts
    portal/                CLIENT PORTAL (outside (app)): login/ (email link), auth/confirm (token-hash or code), (main)/ = layout +
                           home, orders/[id], rmas/ (list, [id] add evidence, new = request form), price-list, terms; actions.ts
    api/portal/            files/[id] (portal_files view) · orders/[id]/imeis (xlsx)
    api/credit-notes/[id]/[pdf|xlsx] · api/rmas/batches/[id]/[xlsx|label]
    (app)/finance/         admin: monthly plan (goals company + per owner, history, projection), actions.ts
    (app)/accounts/        overview/health (page.tsx), list/, new/ (wizard P1), [id]/ (?tab=overview|contacts|orders|rmas|price-lists|files|edit), actions.ts
    (app)/orders/          list (attention filters, KPIs), new/, [id]/ (detail: next action, payments, shipping), [id]/edit/, actions.ts
    api/files/[id]         opens an account file with a 2-minute signed link (RLS-checked)
    api/wa/media/[id]      opens a message file (RLS-checked, cached in the private wa-media bucket)
    api/cron/wa-worker     every-minute worker (called by Supabase pg_cron → public.wa_worker_tick())
  components/
    ui/                    shadcn/ui components (generated; edit sparingly)
    leads/share-form-dialog.tsx  "Share form": /apply links per channel + owner, copy, QR (qrcode)
    shell/                 sidebar links, mobile menu, clocks, user menu
    no-access.tsx          "No access" page
    viz.tsx                StatTile, BarList, Funnel (single hue --viz-1, no chart library)
    shell/app-sidebar.tsx  collapsible + resizable left menu (cookie hkr_sidebar)
    ui/table.tsx           shadcn table + resizable columns for EVERY table (localStorage hkr-cols:*)
    coming-soon.tsx        PageHeader + placeholder for modules not built yet
  lib/
    supabase/              server.ts (Server Components/Actions), client.ts (browser),
                           proxy.ts (session refresh), env.ts
    auth.ts                getCurrentUser(), checkSection(), requireRole()  ← the only auth entry points
    nav.ts                 SECTIONS: menu items, which roles see them, read-only roles, phase
    roles.ts               AppRole type and labels
    supabase/admin.ts      secret-key client: ONLY for /apply, cron jobs and the Auth admin calls of portal invites (after an RLS check)
    leads/                 constants (stages, form options), countries (ISO + market), normalize,
                           scoring (pure, unit-tested), record (clean input → columns), import,
                           service (load settings/team), brevo-sync
    whatsapp/              graph (Meta API calls), templates ({{n}} filling, 24h window — unit-tested),
                           service (send text/template/file, conversations), broadcasts (segments),
                           automations (welcome template + hooks for Phases 3–5)
    orders/                constants (statuses, labels, next actions, file kinds, money), calc (totals = SQL order_recalc,
                           unit-tested), imei (Luhn parsing, unit-tested), service (terms, SKUs, assignments, form accounts)
    accounts/code.ts       client code AAA-CC-NNN suggestion (unit-tested)
    rmas/                  constants (statuses EN/ES, resolutions, fault categories), cutoff (Friday 12:00 Amsterdam), form-import
                           (RMA Request Form xlsx) — unit-tested; batch (loader), tabs
    documents/             credit-note (xlsx in the template grid + loader), credit-note-pdf (@react-pdf/renderer), rma-batch (Excel)
    portal/                texts (all portal copy EN/ES, SOP terms), session (getPortalContext: client account + language)
    sales/                 series (day/week/month buckets), projection (suggestion), health (account health) —
                           all unit-tested; load (sales_orders rpc, periods); tabs (tab bars)
    section-badges.ts      red counters per menu item (live counts of pending work)
    files.ts               account-files bucket, SOP file names ([code]_ORD-NN_[KIND])
    notify.ts              in-app notifications + Brevo email (lead Qualified)
    brevo.ts               Brevo REST client (no-op without BREVO_API_KEY)
    format.ts              dates in the viewer's time zone
  proxy.ts                 Next.js 16 "proxy" (formerly middleware): logged-out → /login
  types/database.ts        generated Supabase types (npm run db:types) — do not edit by hand
supabase/
  functions/whatsapp-webhook/  Meta webhook (Deno, no imports; deployed via dashboard editor, Verify JWT OFF)
  migrations/              one SQL file per change, never edited after it ran on the hosted project
  seed.sql                 demo data (safe on hosted project, no passwords)
  seed_phase3_history.sql  ~36 closed demo orders over 11 months for the dashboards (safe on hosted)
  seed_phase4.sql          3 demo RMAs, 1 open Global Connect batch, 2 credit notes, demo payments for history orders (safe on hosted)
  seed_local_portal.sql    LOCAL ONLY: client logins daan@example.com (AMS-NL-901, EN) and carlos@example.com (MEX-MX-903, ES)
  templates/magic_link.html  portal sign-in email (token-hash link: works on any device) — paste it in the hosted project too
  seed_phase3.sql          Phase 3 demo accounts (codes 9xx, is_demo) + 12 orders, payments, IMEIs (safe on hosted)
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
- Speed (Gabriel, Oct 28 2026): `(app)/loading.tsx` and `portal/(main)/loading.tsx` show a skeleton the instant a link is
  clicked; menu counters and the bell stream in (`components/shell/streamed.tsx`, inside <Suspense>) so a page never waits
  for them. In pages, start every independent query in ONE `Promise.all` (no await chains). Vercel functions run in iad1,
  next to Supabase (East US).
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
| `npm test` | unit tests (vitest: scoring, countries, phones, WhatsApp pricing…) |
| `npm run test:e2e` | browser test per role (app running on :3000 against local Supabase) |
| `node tests/e2e/leads.cjs` | Phase 1 browser test (run right after `npm run db:reset`; it changes data) |
| `node tests/e2e/dashboards.cjs` | Sales / Accounts / Finance dashboards per role (after db:reset) |
| `node tests/e2e/rmas.cjs` | Phase 4 + portal browser test (after db:reset): RMAs, credit note PDF, batch, portal login by link, RMA request on a phone |
| `node tests/e2e/orders.cjs` | Phase 3 browser test (after db:reset; uploads files to local storage) |
| `node tests/e2e/whatsapp.cjs` | Phase 2 browser test (after db:reset, with `npx supabase functions serve --env-file supabase/functions/.env`) |

Docker in Claude's cloud workspace: start it with `dockerd > /tmp/dockerd.log 2>&1 &` before `db:start`.

## Environments and secrets

Environment variable names (values only in Vercel / `.env.local`, never in git or chat):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — used now
- `SUPABASE_SECRET_KEY` — server only: /apply form and cron jobs (form shows "not available" without it)
- `BREVO_API_KEY` — Brevo sync; everything Brevo is skipped while it is empty
- `CRON_SECRET` — long random text; Vercel sends it to /api/cron/* (nightly 03:00 UTC) and Supabase cron
  sends it to /api/cron/wa-worker every minute: the SAME value must be stored in Supabase Vault as `cron_secret`
- `WHATSAPP_ACCESS_TOKEN` — Meta system-user token (temporary test token while testing); nothing is sent without it
- `WHATSAPP_WABA_ID` — WhatsApp Business Account id (from Meta → WhatsApp → API setup)
- Supabase Edge Function secrets (not Vercel): `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
- This repo is PUBLIC: never write phone numbers, people's details, account ids or tokens in it.

Hosted: Supabase project `hkr-system` (East US, ref `vsaumxeuraxmmfyremus`), Vercel project `hkr-system`
in team "Hk Refurbished Stock" (Hobby plan), production URL https://hkr-system.vercel.app, linked to
GitHub `hkr-system/hkr-system` (push to `main` deploys). Vercel env set: Supabase URL + publishable key, `SUPABASE_SECRET_KEY`, `CRON_SECRET` (new value Oct 27 2026, same as Vault `cron_secret`), `WHATSAPP_ACCESS_TOKEN` (60-day user token made Oct 27 2026 in Graph API Explorer → expires ~late Dec 2026; replace with the permanent system-user token `hkr-system` once another portfolio admin approves the request), `WHATSAPP_WABA_ID` (the PRODUCTION WhatsApp account "HK Refurbished Stock", not Meta's test account); `BREVO_API_KEY` pending. Edge Function `whatsapp-webhook` deployed (Verify JWT OFF) with secrets `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. Migrations are applied to the hosted project by Gabriel pasting the file
into Supabase → SQL Editor → Run (until the Supabase CLI is linked).

Demo users (hosted: created by hand in Authentication → Users with Auto Confirm; roles set by seed.sql):
gabriel.demo@ (admin), yessica.demo@ (bd), arslan.demo@ (bd, no accounts), atreyi.demo@
(account_specialist) — all `@hk-refurbished-stock.com`.

## Brand (decided by Gabriel, Oct 27 2026)

- Tokens in `src/app/globals.css` (`--hkr-*`, also Tailwind utilities `bg-hkr-*`, `text-hkr-*`); source of truth
  is the project doc `claude/HKR_brand_tokens.md`. Light ground only: NO navy and NO red as backgrounds; navy for
  type and marks, red (`--hkr-action` = shadcn `--primary`) only for the one primary button per screen and alerts.
  No dark theme (`.dark` mirrors light).
- Fonts: Archivo (headings, `--font-heading`, applied to h1–h3 and `.font-heading`) + Source Sans 3 (body).
  Tables and `[data-tabular]` use tabular-nums.
- Logo `public/brand/logo.png` (transparent) in sidebar, mobile menu, login, /apply; brand photos in `public/brand/photos`.
- `/settings/brand` (admin) shows every token, buttons, chips and a sample table: check it before styling new screens.
- Client-facing figures on /apply come from the SOP (12-month warranty, 1–2 % defects, MOQ US$20,000, sample from
  US$10,000 for 400+/month). Never show prices or engine percentages on /apply.

## /apply landing (Oct 27 2026)

- Link format shared with leads: `/apply?lang=es|en&src=wa|email|linkedin|expo|direct&ref=<owner first name>&utm_*`;
  stored in `lead_form_submissions.src / ref / utm`. Leads → "Share form" builds these links (admin + bd) with a QR.
- Public reference `HKR-YY-NNNN` from `lead_form_submissions.ref_no`; written to the lead timeline and prefilled in the
  WhatsApp message of the thank-you page.
- Thank-you WhatsApp number: the lead market's number (`wa_number_by_market`, active, not demo), else the setting
  `apply_whatsapp_public` (Settings → Landing page). Empty → the WhatsApp button is hidden.
- "How did you hear about us" = other → required free text (`heard_other`, also in the timeline).
- Welcome-kit buttons (who we are, videos/photos, booklet) show "Coming soon" until marketing files exist
  (planned: `marketing_assets` + public bucket, Settings → Landing).
- Form fields: step 1 company/country/city/website; step 2 business_type, sells_iphones, sells_refurbished,
  volume_range, heard_about(+other); step 3 contact_name, title, dial_code + phone_national, email, opt-in.
  Draft kept in localStorage (`hkr_apply_draft`). Segment cards preselect volume_range (small→100-399,
  medium→400-999, large→1000+).

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

## WhatsApp rules (Phase 2, decided by Gabriel Oct 2026)

- Meta Cloud API direct, through the Meta app in HKR's business portfolio; testing uses Meta's free test
  number and Gabriel's own phone as test recipient (a +1 number). US (+1) numbers never receive MARKETING
  templates (Meta pause since Apr 2025, still active Aug 2026) → broadcasts skip them automatically.
- Webhook: <SUPABASE_URL>/functions/v1/whatsapp-webhook, subscribed field "messages" (Meta app → Use cases → Connect on WhatsApp → Step 2).
- Real messages arrive only if (1) the Meta app is PUBLISHED (privacy policy URL = HKR website "Legal Notices" page) and
  (2) the WhatsApp account is subscribed to the app: Numbers → "Import numbers from Meta" does this (POST <WABA>/subscribed_apps).
  Live since Oct 27 2026 on Meta's test number.
- Visibility: admin all; bd/specialist see chats assigned to them or UNASSIGNED (all can see unassigned).
- Unknown number writing in → new lead (stage New, source whatsapp_inbound).
- Opt-out: button/text "Stop promotions", STOP, BAJA… → whatsapp_opt_in = false (never in broadcasts).
- Broadcasts: bd/admin create drafts, only admin approves (DB trigger); per-number daily limit (default 200);
  number auto-paused when Meta quality is RED. Specialist has no access to broadcasts.
- Number per market (setting wa_number_by_market): LATAM → US number (none yet); EU incl. UK → European numbers.
  Oct 27 2026: production number = a Netherlands number, label NL-1, market EU, registered on the production
  WhatsApp account; payment method added in Meta. Gabriel chose NEW numbers over migrating his WhatsApp Business
  app number (app "warm-up" does not transfer to the API). Which number LATAM uses until a US number exists: undecided.
- Meta rules learned: `hello_world` can only be sent from Meta test numbers (#131058); test numbers only send to
  numbers on Meta's recipient list (#131030); every broadcast needs an APPROVED template of the production account;
  new accounts get slower template reviews. Meta allows 2 numbers until the business is verified.
- Setup status, ids and next steps (not for this public repo): project doc `claude/WhatsApp_setup_status.md`.
- No welcome template yet (setting wa_welcome_template empty → not sent).
- Lead → Qualified: owner notified in-app AND by email (Brevo); no owner → all admin + bd.
- Notifications (bell): new WhatsApp message (assignee or everyone if unassigned; one per chat while unread),
  broadcast replies (creator), new form/WhatsApp leads (owner or admin + bd). Accounts needing attention and
  RMA batches ready are to be added in Phases 3–4 (Gabriel's request Oct 27).
- Leads overview "closest to converting": Sample/Proposal, then Meeting, then Qualified; then tier, score.
- Broadcast cost estimate (Gabriel, Oct 28 2026): "Count recipients and cost" in the form and the broadcast page show
  recipients × Meta list price per market (`src/lib/whatsapp/pricing.ts`, unit-tested). Market = Meta pricing market of the
  phone's CALLING CODE (+44 → UK; only +1/+7 split by area code; Meta groups like "Rest of Western Europe"; unlisted → Other).
  Prices: setting `wa_message_rates` (USD per delivered message, marketing/utility/authentication, `as_of`), not confidential
  (bd sees the estimate), edited by admin in Settings → WhatsApp message prices; seeded with Meta's rates read 28 Oct 2026.
  Skipped (US marketing) and failed recipients are not counted. Meta may add taxes; client replies are free.

## Accounts and orders rules (Phase 3, Oct 27 2026)

- Owner and specialist live ONLY in `account_assignments` (no owner column) — Gabriel's decision. bd sees accounts
  where they are owner; admin assigns. Specialist (and admin) create accounts (wizard P1); bd edits own accounts.
- Client code AAA-CC-NNN (SOP §2.1), check constraint; `settings.account_code_last_seq` follows the highest REAL code
  (demo accounts `is_demo` use 9xx and never move it); only admin changes a code.
- Route: intermediary set → client pays EUR (partner invoice, uploaded) else USD (SOP §2.4). invoice_format JSON:
  battery_line_separate / show_ce_text / show_note. Delivery set-up per account, copied to each order.
- Orders: number ORD-NN per account (trigger). Totals by trigger `order_recalc` (never typed): subtotal + separate
  battery line (qty × battery_unit_usd, only if the account's format is separate and the SKU is battery_eligible)
  + freight + customs − RMA discount; USDT adds settings.usdt_fee_pct (0.85 %) of that; deposit settings.deposit_pct (10 %).
  MOQ (US$20,000; first order US$10,000) is a warning in the form, not a block.
- Status flow Quoted → Invoiced → Deposit paid → In preparation → Ready to ship → Balance paid → Shipped → Delivered →
  Closed; one step at a time (admin can set any). Deposit/Balance paid come from an ADMIN-confirmed payment.
  "Ready to ship" = goods ready in HK with balance due (status); "Clear to ship" (computed in view `order_overview`)
  = balance confirmed + IMEI loaded + (client LABEL file | courier for our booking). Shipped needs Clear to ship + AWB.
- Payments: anyone with the account records (status awaiting_confirmation, expected amount and difference computed);
  only admin confirms/edits/deletes (SOP P3). Bell: admins get "Payment to confirm"; owner + specialists get
  "Ready to ship, balance due".
- Finance: `orders_finance` (base cost, margin %) and `order_lines_finance` (base price) — admin only.
- IMEI master: 15 digits + Luhn; unique across all accounts; upload reports duplicates/invalid; shipped_at set on Shipped.
- Files: private bucket `account-files/<account_id>/orders/ORD-NN/<CODE>_ORD-NN_<KIND>.<ext>` (or /general/);
  uploaded from the browser (storage RLS by account), registered in `files`; opened via /api/files/<id>.
- WhatsApp: a phone of an account contact links its chat to the account (no lead is created); hook
  `onOrderStatusChange` stays inactive until an order-status utility template is approved.

## Dashboards rules (Gabriel, Oct 27 2026)

- Revenue = invoice total (`total_usd`) of orders with status ≥ Invoiced, dated by `order_date` (brief §8).
- Margin visibility: admin all; **a BD user sees the net margin of HER OWN accounts** (decision overriding brief §3
  row 2 for bd), never base cost or company totals; the specialist sees no margin and no revenue widgets
  (brief §8). Served by `sales_orders(from, to)` (security definer); `orders_finance` stays admin-only.
- Sales goals: monthly, company (owner null) + per owner; admin edits in Finance; a BD sees only her own goal.
- Sales history (monthly totals from before the system) and projections: admin only. A month's "actual" = the
  history figure when given, else the system's orders. Suggested projection = average of the last 3 months ×
  (same month last year ÷ the 3 months before it last year) when that history exists — Gabriel writes the figure.
- Account health: needs attention (payment to confirm, deposit due, balance due on Ready to ship, ETA pending,
  open RMAs from Phase 4) > inactive (active account, no order for `settings.account_inactive_days`, default 45 —
  Gabriel had no preference) > open orders > onboarding > OK.
- Menu "Orders" is labelled **Sales** (UI in English); Finance is a new admin menu item.
- Menu counters (Gabriel): per section, red, live counts — Sales (admin: payments to confirm; others: orders needing
  action), WhatsApp (unanswered chats), Leads (unread new-lead notices). RMAs: batch deadlines in Phase 4.

## Client portal (/portal) — added by Gabriel Oct 27 2026 (not in the brief)

- Built together with Phase 4 (RMAs). Clients see: open orders, IMEIs, invoices of the order, terms and conditions,
  their current approved price list (Phase 6), pending RMAs and history of unresolved RMAs; and submit RMA requests
  per unit (IMEI, defect, evidence photos/videos) replacing the RMA Request Form xlsx (SOP P6 fields).
- IMEI not in the IMEIs shipped TO THAT ACCOUNT → warning, not a block (never reveal another client's IMEI).
- Languages: English + Spanish (default from the account language), like /apply.
- Login: email link (magic link) ONLY for users HKR created and authorised — no self sign-up
  (`shouldCreateUser: false`, Supabase sign-ups off; a portal user is created by admin/specialist from a contact).
  Clients get NO internal role: separate `portal_users` table, own layout, `is_staff()` stays false for them.
- Terms and conditions: an official document Gabriel will write (RMA return address, bank and USDT details,
  RMA procedure, responsibilities of HKR and of the client). Until it exists the page shows "coming soon".

## RMA rules (Phase 4, decided by Gabriel Oct 27 2026 from the templates)

- RMA number `<code>-RMA-NN` per account; credit note number **`<code>-CN-NN`** per account (overrides SOP P10 /
  brief "CN + invoice + seq").
- Resolution per unit = union of the RMA form and tracker lists: Return to HK · Repair credit (local) · Credit note ·
  Replacement (with next order) · Not covered (Pending until decided).
- Two statuses: the RMA case follows the brief flow (Requested → Form received → Verified → Approved → Awaiting
  return / Credit agreed → In batch → Received HK → Closed); each unit has the tracker unit status (Reported, Verified,
  Awaiting shipment, Shipped to HK, Received in HK, Returned to client, Credited, Rejected, Closed).
- Credit cap = invoice value × 1 % (SOP): above it → red warning; admin can still approve.
- Fault categories: the 12 of the RMA Request Form (see the project doc).

## Client portal — technical rules (Oct 27 2026)

- Clients have NO app_role (profiles.role null) → every staff policy (is_staff, has_account_access) is false for them.
  They read ONLY through the portal_* views (no security_invoker on purpose, filtered by `portal_account_id()`, client-safe
  columns) and write ONLY through portal_create_rma / portal_add_evidence / portal_submit_rma / portal_check_imei.
  A view reading another security_invoker view would apply the client's RLS → compute from base tables instead.
- Logins are created only from Accounts → <account> → Client portal (admin + specialist): Auth admin createUser + portal_users.
  Sign-ups are OFF (`[auth] enable_signup = false`; `[auth.email] enable_signup` must stay TRUE or email sign-in dies).
  Hosted (done Oct 28 2026): "Allow new users to sign up" OFF; Site URL = https://hkr-system.vercel.app.
  Email template "Magic link" = templates/magic_link.html can only be edited AFTER custom SMTP (Brevo) is set up — pending.
- Sign-in: email link (needs custom SMTP on hosted — Supabase's built-in mailer only reaches team members) or
  "Copy sign-in link" (generateLink, 1 hour) sent by WhatsApp. Disabling a login also bans it in Auth.
- Evidence: client uploads to account-files/<account>/rmas/RMA-NN/ (storage policy portal_storage_can_upload, RMA ≤ verified).
- Portal shows order files of kinds INV-HK, INV-EU, IMEI, TRK*, POD, CN and RMA FORM/PRUEBAS; credit notes only when issued.

## Sales KPIs (Gabriel, Oct 27 2026)

- View `order_cycle` (orders ≥ Invoiced): processing time = deposit confirmed → shipped; cash cycle = invoice → fully paid
  (invoice date = the Invoiced status event, else order date); "to collect" = payable − confirmed payments of unpaid orders.
- /sales shows orders made (period), paid, pending payment (today), to collect (USD + EUR), avg processing, avg cash cycle,
  average order (not for the specialist). The account page shows the same per client ("Orders at a glance").
- /sales/mix: best models and configurations, price by model (admin also margin), prices accepted by each client vs the
  average. Price vs the list offered and "how much more we can charge" (SOP §5.3 R_c / Extra_c) come with Phase 6, admin only.

## Mobile (Gabriel, Oct 27 2026)

- Every screen must work at phone width (390 px): no page-level horizontal scroll (tables scroll inside their card),
  WhatsApp inbox shows the list first on phones. The portal RMA form keeps the send button sticky at the bottom.

## Open questions (ask before the phase that needs them)

- Phase 4 + portal: templates received Oct 27 2026 (structure in project doc `claude/HKR_phase4_templates.md`;
  originals NOT in this public repo). Still missing: the official terms document for the portal.

- Invoices: Gabriel sent 5 real invoices (Ever State; NOT in the repo — real client and bank data). The Kopious
  invoice uses a USDT fee of 0.8 % while the brief says 0.85 % — which is current? No Streamline FZE sample yet.

- Phase 3 invoices still to build (PDF + xlsx, Draft → Approved → Sent, MMDDYYYY-seq) from those references:
  per-line description (model / storage / SIM / CE|UKCA / battery health or "New Battery cell 0 Cycle" / grade /
  colours), separate "New battery cell" line, shipping and customs per unit, payment-details block from Settings.

- WhatsApp (status Oct 27 2026): first HKR template `hkr_iphone14_eu_offer` (marketing, EN, fixed prices) PENDING at
  Meta → then test broadcast to lead "Test NL (Gabriel)" (EU, opt-in). Meta business verification submitted
  (~2 working days). Permanent system-user token waits for a second portfolio admin's approval. Change the webhook
  verify token (placeholder) in Supabase secrets and Meta together. Offer: a reusable template with variables for
  models/prices. Clean-up pending Gabriel's OK: Meta sample data (+16505551111 number, "test user name" chat/lead),
  the mistaken unverified NL number in the production account.
- WhatsApp: Meta v26 "usernames" can omit the phone number (`from`) for users who adopt a username — `wa_ingest`
  keys on the phone; revisit when Meta enables it widely.

- Which countries are "target countries" (+30)? Until filled in Settings, no lead reaches Tier A.
- Owner notification email for new form leads: needs an owner rule and the Brevo sender domain (SPF/DKIM).
