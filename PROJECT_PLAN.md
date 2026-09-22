# ClientLeads — Project Plan & Roadmap

**Source of truth for requirements:** [`clientleads.md`](./clientleads.md) (PRD)
**Purpose:** Track build progress milestone by milestone, from foundation to first-client validation.

**How to use this document:**
- Update the **Status Summary** table as milestones progress.
- Check off tasks (`- [ ]` → `- [x]`) as they are completed.
- Record deviations from the PRD in **Appendix A — Decisions & Deviations**.
- A task is only checked off when its **Acceptance Criteria** are met.

**Status legend:** `Not Started` · `In Progress` · `Blocked` · `Done`

---

## Guiding Constraints (from PRD §75 — non-negotiable)

- [ ] Single-organization deployment now, **tenant-ready schema** (`organization_id` on all tenant-owned tables, RLS enforced)
- [ ] No SaaS billing, tenant provisioning, or multi-admin management in MVP
- [ ] No real-estate concepts hard-coded into core tables (they live in tags/custom fields/config)
- [ ] Public and authenticated routes strictly separated; public endpoints validated, rate-limited, leak-free
- [ ] No Docker, microservices, or unnecessary infrastructure
- [ ] First deployment is **production**, not a throwaway prototype

---

## Status Summary

| Milestone | Phase | Target | Status | Notes |
|---|---|---|---|---|
| M0 | Project Setup | — | In Progress | Implementation done — waiting on Supabase creds + GitHub push |
| M1 | Foundation | Week 1–2 | Not Started | |
| M2 | CRM | Week 3–5 | Not Started | |
| M3 | Public Presence | Week 6–7 | Not Started | |
| M4 | Booking | Week 8–10 | Not Started | |
| M5 | Communication | Week 11–13 | Not Started | Requires email provider decision |
| M6 | Productivity | Week 14–15 | Not Started | |
| M7 | Validation & Launch | Week 16 | Not Started | |

> Targets are indicative planning weeks from project start — adjust as actual velocity is observed.

---

## M0 — Project Setup

**Goal:** Empty but correctly configured app + database that deploys.

### Tasks
- [x] Initialize Next.js (App Router) + TypeScript + Tailwind project — **Next 16.3.6 · React 19 · Tailwind v4 · Turbopack**
- [x] Set up repository, branch strategy, and lint/format tooling (ESLint, Prettier) — git initialized, strategy in README
- [ ] Create Supabase project; connect local/dev environments — **code scaffolded** (`src/lib/supabase/*`, `src/proxy.ts`); project + creds pending
- [x] Set up environment variable management (no `service_role` key ever exposed to client) — `.env.example` + validated `lib/env.ts`
- [x] Choose initial deploy target (e.g., Vercel + Supabase) and configure CI (build + lint) — **Vercel** chosen; CI = lint + typecheck + build (`.github/workflows/ci.yml`); pushes to GitHub activate it
- [x] Base design system: layout shell, typography, colors, reusable UI components (buttons, inputs, tables, modals) — tokens + button/input/textarea/select/label/card/badge; shell with roadmap-aware nav. Tables/modals deferred until a module needs them

### Acceptance Criteria
- `main` deploys automatically; app renders a styled empty shell
- Dev and production Supabase projects separated; env vars validated at boot

---

## M1 — Foundation (PRD Phase 1)

**Goal:** Auth, tenancy, profiles, settings — the security backbone everything else depends on.

### Tasks
- [ ] **Authentication (PRD §7)**
  - [ ] Email/password sign-up, sign-in, password reset (Supabase Auth)
  - [ ] Protected route middleware for `/dashboard/*`
  - [ ] Public route zones for `/[businessSlug]/*`, booking, and forms
- [ ] **Tenancy core (PRD §39–41)**
  - [ ] Migration: `organizations`, `organization_members`, `profiles`
  - [ ] Seed the first real-estate client organization
  - [ ] Auto-add registering users to the org (single-org flow, membership-based — no provisioning UI)
  - [ ] Helper: current user's org + role resolution
- [ ] **RLS (PRD §61)**
  - [ ] Membership-based RLS policy template applied to every tenant table
  - [ ] Automated RLS test script: user A cannot read/write another org's rows
- [ ] **Business Profile / Settings (PRD §8)**
  - [ ] Org profile edit: name, logo, contact info, address, timezone, social links, slug
  - [ ] Branding settings: primary/secondary colors
  - [ ] Supabase Storage buckets + policies for logos/images (org-scoped)
  - [ ] User profile settings (name, avatar, password)
- [ ] **Core UI / navigation**
  - [ ] Dashboard shell: sidebar, header, mobile-responsive nav
  - [ ] Roles: `owner` / `admin` / `staff` ( enforced in UI; configurable permissions deferred)

### Acceptance Criteria
- A signed-in user sees only their org's data; cross-org access attempts fail at the DB level (verified by tests)
- First client's business profile and branding are configured end-to-end
- All migrations include RLS from day one — no table exists without policies

### Depends on: M0

---

## M2 — CRM (PRD Phase 2)

**Goal:** The contact database the client will import their world into.

### Tasks
- [ ] **Contacts (PRD §10)**
  - [ ] List view: search (name/email/phone/company), filters, pagination
  - [ ] Create / edit / view screens with core fields
  - [ ] Contact detail page with activity timeline placeholder
  - [ ] Soft-delete or archive behavior; audit log entry on delete/update (PRD §38)
- [ ] **Tags (PRD §11)**
  - [ ] Tag CRUD; add/remove tags on contacts; filter contacts by tag
- [ ] **Custom Fields (PRD §12, §44–45)**
  - [ ] `custom_fields` + `contact_custom_values` tables
  - [ ] Admin UI to create fields: text, number, date, boolean, dropdown, multi-select
  - [ ] Render custom fields on contact create/edit/detail
  - [ ] Seed real-estate example fields as *config*, not schema (Preferred Area, Budget, etc.)
- [ ] **Leads (PRD §14–15)**
  - [ ] Lead records linked to contacts; stage (New → Contacted → Qualified → Appointment → Active → Won → Lost), source, priority, assigned user, expected value, next follow-up
  - [ ] Pipeline/board view + stage changes recorded as activities
- [ ] **Activities (PRD §13, §54)**
  - [ ] Generic `activities` table + writer helper used by all modules
  - [ ] Timeline rendering on contact + lead detail pages
  - [ ] Notes (note_added activity)
- [ ] **Import / Export (PRD §36)**
  - [ ] CSV upload → column mapping → preview → duplicate detection → import → results summary
  - [ ] Duplicate prevention: match on email, then phone; low-confidence matches flagged for review, never auto-merged (PRD §37)
  - [ ] CSV export of contacts
- [ ] **Search (PRD §35)** — contact search MVP complete

### Acceptance Criteria
- Client can import their existing contact list with < 5% duplicates requiring manual review
- Every contact/lead change appears on the activity timeline
- Custom fields work without any schema change when adding a new field

### Depends on: M1

---

## M3 — Public Presence (PRD Phase 3)

**Goal:** A live, branded public page that can capture inquiries.

### Tasks
- [ ] **Services (PRD §16)**
  - [ ] Service CRUD: name, description, duration, price/currency, location type, active, booking-enabled flag, buffers, minimum notice, max booking window
- [ ] **Public Business Page (PRD §9)**
  - [ ] `/[businessSlug]` route: header, hero, about, services, lead form, resources, contact, footer
  - [ ] Brand colors applied; mobile-first layout (PRD §70)
  - [ ] 404 for unknown/disabled slugs
- [ ] **Forms (PRD §22–23)**
  - [ ] Form builder: text, email, phone, textarea, dropdown, multi-select, checkbox, date, hidden/source
  - [ ] Public form rendering + submission endpoint
  - [ ] Submission workflow: validate → find/create contact (email/phone match) → activity → create/update lead → assign source → notify business
  - [ ] Spam controls: honeypot + rate limiting + server-side validation (CAPTCHA only if needed) (PRD §67)
- [ ] **Resources (PRD §30–31)**
  - [ ] Resource CRUD: title, description, file, thumbnail, public/private, published/unpublished, download count
  - [ ] Storage policies per visibility; private files never via predictable URLs (PRD §65)
  - [ ] Gated resources: name/email/phone form before download → contact create/update → activity
- [ ] **Notifications (PRD §34)** — email notifications for new lead / form submission (needs M5 provider; interim: single transactional email)

### Acceptance Criteria
- Public page is live at a real URL, looks branded, works on mobile
- A stranger can submit an inquiry and the business gets notified; contact + lead + activity created automatically
- No private data reachable from public routes (manual + automated check)

### Depends on: M1, M2

---

## M4 — Booking (PRD Phase 4)

**Goal:** Visitors book appointments; business manages them.

### Tasks
- [ ] **Availability (PRD §17)** — weekly rules: day, start/end time, timezone, active; per-user or org-level
- [ ] **Blocked Times (PRD §18)** — date/time ranges with reason
- [ ] **Appointment engine**
  - [ ] Slot computation: availability − blocked times − existing appointments − buffers − minimum-notice/max-window rules
  - [ ] `appointments` table with statuses: Scheduled, Confirmed, Completed, Cancelled, No-show, Rescheduled
  - [ ] Conflict-safe booking (server-side re-validation + DB constraint to prevent double-booking)
- [ ] **Public booking flow (PRD §19)**
  - [ ] `/[slug]/book` → service → date → time → contact info → confirm
  - [ ] Creates/updates contact, records activity, sends confirmation
  - [ ] Secure, non-enumerable booking tokens (PRD §68)
- [ ] **Confirmation / Cancellation / Rescheduling (PRD §20–21)**
  - [ ] Public reschedule/cancel via secure token link
  - [ ] Emails to business + client on all status changes
- [ ] **Internal appointment management**
  - [ ] Calendar/list view; confirm, complete, cancel, reschedule, mark no-show
  - [ ] Dashboard widgets: upcoming appointments (PRD §33)
- [ ] **Reminders (PRD §20)** — 24h and 2h before appointment (timing config deferred)

### Acceptance Criteria
- End-to-end public booking works on mobile in under 60 seconds
- Double-booking is impossible under concurrent attempts (tested)
- Public endpoints expose no other customers, notes, or private calendar data

### Depends on: M1, M2, M3 (services), email sending (M5 provider — at minimum transactional emails working by end of M4)

---

## M5 — Communication (PRD Phase 5)

**Goal:** Newsletters/campaigns with segmentation, delivery, and compliance.

### Tasks
- [ ] **Email provider decision** (PRD §62) — evaluate on: pricing, deliverability, API simplicity, Canadian/privacy requirements, transactional + campaign + webhooks + unsubscribe support
  - [ ] Decision recorded in Appendix A
  - [ ] Domain authentication (SPF/DKIM/DMARC) configured
- [ ] **Email Templates (PRD §25)**
  - [ ] Template CRUD; seeded initial templates (welcome, confirmation, reminder, cancellation, reschedule, follow-up, newsletter, thank you, lead response)
  - [ ] Variable interpolation: `{{first_name}}`, `{{business_name}}`, `{{service_name}}`, `{{appointment_date}}`, `{{appointment_time}}`, `{{booking_link}}`
- [ ] **Campaigns (PRD §26)**
  - [ ] Campaign CRUD: name, subject, preview text, content, sender name/email, status (Draft → Scheduled → Sending → Sent/Cancelled)
  - [ ] Scheduling
- [ ] **Audience selection (PRD §27)** — all contacts / tags (AND) / contact type / custom-field filters
- [ ] **Delivery (PRD §26, §29)**
  - [ ] Recipient resolution → `campaign_recipients` → batch send via provider
  - [ ] Excludes unsubscribed/suppressed contacts, always
  - [ ] Unsubscribe mechanism + `unsubscribed_at` on contacts + consent tracking
- [ ] **Campaign analytics (PRD §28)** — webhooks → delivered, bounced, opened, clicked, unsubscribed
- [ ] Wire transactional emails (confirmations, reminders, notifications) through the same provider

### Acceptance Criteria
- A segmented campaign sends to a tag-selected audience; opted-out contacts provably excluded
- Open/click/unsubscribe metrics visible per campaign
- Appointment confirmations/reminders send reliably (verified in provider logs)

### Depends on: M2 (contacts/tags), M3 (notification emails)

---

## M6 — Productivity (PRD Phase 6)

**Goal:** Daily-driver features that make the platform sticky.

### Tasks
- [ ] **Tasks & Follow-ups (PRD §24)**
  - [ ] Task CRUD: title, description, linked contact/lead/appointment, assignee, due date, priority, status (Open, In Progress, Completed, Cancelled)
  - [ ] Views: my tasks, overdue, due soon; dashboard "Tasks Due" widget
- [ ] **Basic Automations (PRD §32)** — controlled triggers only:
  - [ ] Appointment booked → confirm email, activity, optional follow-up task
  - [ ] Form submitted → contact, lead, activity, notify, task
  - [ ] Appointment completed → activity + follow-up task
  - [ ] Resource downloaded → contact + activity
  - [ ] Automations admin: activate/deactivate, configure actions (no visual builder)
- [ ] **Notifications (PRD §34)** — email channel complete: new lead, form submission, appointment created/cancelled/rescheduled, assigned task
- [ ] **Dashboard & Analytics (PRD §33)**
  - [ ] Metrics: total/new contacts, open leads, upcoming/completed appointments, pending tasks, campaigns sent + engagement
  - [ ] Sections: upcoming appointments, tasks due, recent leads, recent activity, campaign performance, quick actions
- [ ] **Audit logging (PRD §38)** — admin actions recorded (deletes, updates, campaign sent, user added, service changes)
- [ ] **Global search** — extend beyond contacts to leads, appointments, campaigns, tasks (PRD §35)

### Acceptance Criteria
- The 4 automation triggers fire reliably and are observable via activities
- Dashboard answers "what do I need to do today?" at a glance (PRD §70 action-oriented dashboard)

### Depends on: M2, M3, M4, M5

---

## M7 — Validation & Launch (PRD Phase 7)

**Goal:** Production deployment to the first client and structured feedback loop.

### Tasks
- [ ] **Security hardening pass (PRD §66–68)**
  - [ ] Server-side input validation audit on all write endpoints
  - [ ] Rate limiting on public form/booking endpoints; file upload type/size validation
  - [ ] RLS test suite re-run against all tables; storage policies reviewed
  - [ ] Confirm no `service_role` key in client bundles
- [ ] **Privacy readiness (PRD §69)** — privacy policy + terms pages, unsubscribe status, data export, deletion workflow
- [ ] **Performance & mobile QA** — public pages + booking flow tested on real mobile devices
- [ ] **Load/soak check** on import + campaign send at expected volumes
- [ ] **Deploy to production** with monitoring, error tracking, DB backups enabled
- [ ] **Client onboarding:** configure branding, import contacts, create services + availability, publish page, send first campaign
- [ ] **Observation period (PRD §71)** — collect: unused features, missing workflows, confusing screens, workarounds, requested integrations, performance issues
- [ ] Review MVP Success Criteria checklist (below) with the client

### MVP Success Criteria Checklist (PRD §71)
- [ ] **Contacts:** import, add, edit, search, tag, view history
- [ ] **Leads:** receive, assign, move stages, schedule follow-ups
- [ ] **Services:** create, duration, availability, publish
- [ ] **Appointments:** receive bookings, view calendar, confirm, cancel, reschedule, notifications
- [ ] **Public:** branded profile, services, inquiries, bookings, resources
- [ ] **Communications:** create newsletters, select audience, send, performance, unsubscribe management
- [ ] **Management:** create tasks, track activities, dashboard metrics

### Depends on: M1–M6

---

## Operating Model — One Client at a Time (until validation says otherwise)

**Guiding principle:** The codebase and data model are client-agnostic by design (PRD §39–40). Per-client differences — branding, services, availability, forms, tags, custom fields, templates — are **configuration data**, never code. Therefore deploying a client is an operational task, not a development task.

### Three invariants (never break these)
- [ ] **Single codebase** — no per-client forks; behavior driven by org resolution (session or `slug`)
- [ ] **Client differences are data** — no per-client columns, hard-coded fields, or industry-specific logic in core code
- [ ] **Tenant-ready model maintained** — `organization_id` on every tenant table, RLS membership policies on every table

### Deployment topology per client (the only real variable)
| Option | Adding a client | Cross-client risk | Ops cost | Choose when |
|---|---|---|---|---|
| **A. Shared project** (one app/DB, N orgs) | Insert org + member + config — no deploy | None if RLS airtight | Lowest | RLS test suite green in CI |
| **B. Cloned stack** (own Supabase project per client) | Clone app + run migrations + config | Physically zero | Higher; migrations re-applied per project | RLS not yet proven, or client demands isolation |

- [ ] Client 1: shared project, single org (as planned, M0–M7)
- [ ] Decide client 2 topology **after** the RLS suite is green (A recommended; B if in doubt — schema makes later consolidation a data task)
- [ ] Record each client's topology in **Appendix A**

### Per-client deployment checklist
- [ ] Create `organizations` row + slug; add owner/admin member
- [ ] Configure business profile + branding
- [ ] Configure services, availability, forms, email templates, automations (all data)
- [ ] Seed optional config: custom fields, tags, contact types for the client's industry
- [ ] Import contacts (CSV import + duplicate review)
- [ ] Publish public page; test booking, forms, resource download
- [ ] **Shared project only:** re-run cross-org RLS test suite and integration smoke test
- [ ] Run M7 observation loop; feed findings into roadmap as **generic** features

### Fully multi-tenant transition (only after 2–3 clients show repeatable patterns)
- [ ] No data migration and no code rewrite needed — schema already tenant-ready
- [ ] Add only: platform-admin UI · signup→provision flow · billing/subscriptions · subdomains/custom domains (§72)

### Traps to avoid
- [ ] **Divergence trap:** forking per client or hard-coding client-specific logic
- [ ] **Clone drift trap:** if using cloned stacks, keep migrations versioned + idempotent so N databases stay in sync

---

## Post-MVP (Explicitly Out of Scope Until Validation — PRD §72–73)

Do **not** start these until M7 validation completes:

- SaaS administration / platform admin / super-admin dashboard
- Tenant provisioning & self-service onboarding
- Billing, subscriptions, plans, usage billing
- Subdomain or custom-domain public pages at scale
- Industry configuration packs (real estate, consulting, etc.)
- Google/Microsoft login, MFA, organization invitations
- Configurable lead stages & role permissions
- In-app notification channel
- MLS / property matching / transaction management (unless client requests)

---

## Cross-Cutting Concerns (tracked continuously)

| Concern | Where enforced | Status |
|---|---|---|
| RLS on every new table | Every migration in M1–M6 | Not Started |
| `organization_id` on tenant tables | Every migration in M1–M6 | Not Started |
| Server-side validation | Every endpoint, M3–M6 | Not Started |
| Activity recorded for meaningful events | Every module, M2–M6 | Not Started |
| Mobile-first public pages | M3, M4 | Not Started |
| No real-estate hard-coding | M2 custom fields onward | Not Started |
| Audit logging | M2, M6 | Not Started |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Email provider selection delayed | Blocks M4 confirmations + all of M5 | Pick a provider at start of M3; integrate transactional send early |
| Duplicate-heavy CSV import | Poor first impression in M2 | Preview + flag-for-review flow; dry-run import before go-live |
| Double-booking races | Client trust | Server-side slot re-validation + DB exclusion constraint |
| RLS gaps discovered late | Security incident | Automated cross-org access test in CI from M1 onward |
| Scope creep toward "enterprise CRM" | Schedule slip | Enforce PRD §4 non-goals and §75 DO-NOT list at every review |
| Public form spam | Data quality | Honeypot + rate limit at M3; add CAPTCHA only if abused |

---

## Appendix A — Decisions & Deviations

_Record decisions made during development that the PRD leaves open, and any deviations from it._

| Date | Decision / Deviation | Rationale | PRD Reference |
|---|---|---|---|
| 2026-09-22 | Package manager: **npm** (pnpm/bun not on machine) | Simplest default; swappable later | §62 |
| 2026-09-22 | Deploy target: **Vercel**; CI = GitHub Actions (lint/typecheck/build) | Best-in-class Next.js hosting; code quality gate before deploy | §62 |
| 2026-09-22 | **Next.js 16 + Turbopack + Tailwind v4** (create-next-app latest) | Version-matched; `middleware` → `proxy`, async Request APIs, `next lint` removed; docs bundled in `node_modules/next/dist/docs/` | §62 |
| 2026-09-22 | Design system: hand-rolled primitives (no Radix/headless dep); CSS-variable tokens | Lean MVP per PRD; per-tenant branding maps to same tokens later | §8, §70 |
| 2026-09-22 | Dashboard nav shows modules as planned (`M2`–`M6` badges) until built | Honest UI about roadmap; no dead routes/404s | §63 |
| 2026-09-22 | Supabase project creation delegated to user - scaffold + `.env.local` ready | Requires their account/login | §7 |

---

## Appendix B — Change Log

| Date | Change | Author |
|---|---|---|
| 2026-09-22 | Plan created from PRD | AI |
| 2026-09-22 | M0 implemented: Next 16 scaffold, design system, dashboard shell, Supabase scaffolding, CI, Vercel target | AI |
