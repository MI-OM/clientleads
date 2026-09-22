# ClientLeads

Client Engagement & Business Management Platform — one simple system to manage
contacts, capture leads, accept bookings, communicate with clients, and grow
relationships. Configured for a real-estate first client, architected to be
tenant-ready for future multi-client deployments.

## Docs

| Document | Purpose |
| --- | --- |
| [`clientleads.md`](./clientleads.md) | Product Requirements Document (source of truth) |
| [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) | Milestone roadmap and progress tracking |

## Stack

- **Frontend:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
- **Backend:** Supabase (PostgreSQL, Auth, RLS, Storage)
- **Email:** external provider (decision tracked in PROJECT_PLAN.md, M5)
- **CI/CD:** GitHub Actions (lint + typecheck + build) → Vercel

## Getting started

Requirements: Node.js 20.9+ (developed on 24), npm.

```bash
npm install

# Copy env template and fill in your Supabase project URL + anon key
cp .env.example .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Supabase is not yet connected in M0 — the dashboard shows a "not configured"
> state until `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
> are set. M1 ships real auth, tenancy + RLS, and settings — see below.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build (Turbopack) |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |
| `npm run test:rls` | RLS isolation check against the live Supabase project (skips when env is unset) |

## Database (migrations)

Migrations live in `supabase/migrations/` and are written in Supabase CLI format
(`<timestamp>_<name>.sql`). They are **idempotent** (`create table if not exists`,
`drop policy if exists`, `on conflict do nothing`) so they can be applied
cleanly on a fresh project, or re-pasted to repair an existing one.

- **Dashboard SQL editor** — open each file and paste it in, or
- **Supabase CLI** — `supabase db push` once the project is linked.

What M1 migrations create:

| File | Contents |
| --- | --- |
| `20260922000001_m1_tenancy_core.sql` | `organizations`, `profiles`, `organization_members` + full RLS, signup trigger (new users auto-join the default org), grants, seed of the first client org |
| `20260922000002_m1_storage.sql` | `org-assets` storage bucket (public-read, member-write) for logos |

Every tenant-owned table created in later milestones carries `organization_id`
and ships with RLS policies in the same migration — "no table without policies".

### Before go-live

- Rename the seeded placeholder org (`First Client Real Estate` / slug
  `first-client`) in `20260922000001_m1_tenancy_core.sql` to the real client.
- In Supabase Auth settings: enable **Confirm email**, note the **Site URL**,
  and add `http://localhost:3000/auth/confirm` (dev) plus your production
  domain to **Redirect URLs** so password-reset links work.
- Set the three env vars (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) locally and in
  Vercel, then run `npm run test:rls` to verify cross-org isolation.

## Project structure

```text
src/
├── app/
│   ├── (app)/dashboard/   # Authenticated app (protected by proxy)
│   ├── (auth)/            # login, register, reset-password (public)
│   ├── auth/confirm/      # Supabase magic-link / recovery token exchange
│   ├── layout.tsx         # Root layout (fonts, metadata)
│   └── page.tsx           # Public landing
├── components/
│   ├── dashboard/         # App navigation shell, page header
│   └── ui/                # Design system primitives (button, input, card, …)
├── lib/
│   ├── auth/              # Server actions + org/session helpers
│   ├── env.ts             # Validated env access (client-safe split)
│   ├── utils.ts           # cn() class-name helper
│   └── supabase/          # client / server clients (Next 16 async cookies)
└── proxy.ts               # Route protection + session refresh (Next 16 `proxy`)

supabase/
└── migrations/            # Versioned SQL (tenancy core, storage, later modules)
scripts/
└── check-rls.mjs          # RLS isolation verification (npm run test:rls)
```

> Note: Next.js 16 renamed `middleware.ts` → `proxy.ts` and made `cookies()`,
> `headers()`, `params`, and `searchParams` async. Version-matched docs are in
> `node_modules/next/dist/docs/`.

## Environment variables

See `.env.example`. Rules:

- `NEXT_PUBLIC_*` values are safe for the browser.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only — never import it from a client
  component and never expose it to the client bundle.

## Branch strategy

- `main` is the deployable branch — CI must pass to merge.
- Work in short-lived branches: `feat/<module>` or `fix/<description>`.
- PRs run lint, typecheck, and build automatically once pushed to GitHub.

## Deployment

Target: **Vercel**. Connect the GitHub repo in Vercel and environment variables
will need to be added there (or via `vercel env`). CI here handles code quality;
Vercel handles previews + production deploys. Full deployment steps land with
M7 (Validation & Launch) in PROJECT_PLAN.md.