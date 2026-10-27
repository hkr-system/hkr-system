# HKR System

Internal operations platform of HK Refurbished Stock: accounts, orders, RMAs, price lists, leads
and WhatsApp in one app. Built with Next.js, Supabase and Vercel.

Developer notes and conventions: see [CLAUDE.md](./CLAUDE.md).

## First-time setup (hosted)

1. **Vercel** → Add New… → Project → import `hkr-system/hkr-system` → add the environment variables
   listed in `.env.example` → Deploy.
2. **Supabase** → Authentication → Sign In / Providers → turn off "Allow new users to sign up".
   Authentication → URL Configuration → Site URL = the Vercel address.
3. **Supabase** → SQL Editor → paste `supabase/migrations/20261027000000_foundation.sql` → Run.
4. **Supabase** → Authentication → Users → Add user → Create new user (Auto Confirm on) for the four
   demo emails in CLAUDE.md.
5. **Supabase** → SQL Editor → paste `supabase/seed.sql` → Run.

## Local development

```
cp .env.example .env.local   # fill with the local values printed by `npm run db:start`
npm install
npm run db:start
npm run dev
```
