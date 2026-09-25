# ClientLeads Release Readiness Plan

## Purpose

This is the active plan for closing the gap between the built product and a
safe first-client launch. It supersedes no product requirements; it orders the
remaining work so that coding, database changes, and operational setup happen
only when their prerequisites are met.

## Release rule

Do not label the product production-ready until every **Launch blocker** below
is complete and verified against the real Supabase project. A successful local
typecheck is necessary but is not sufficient evidence for a feature involving
database policies, email, OAuth, or scheduling.

## Workstream 1 — Database and integration baseline

**Status:** blocked on applying migrations to Supabase.

### Tasks

- Apply migrations in version order, including:
  - `20260923000006_m5_campaigns.sql` through `20260923000015_m6_advanced_automations.sql`
  - `20260924000015_m3_public_resource_visibility_fix.sql`
  - `20260924000016_integrations.sql`
  - `20260924000017_m6_reminders.sql`
- Record the migration date, environment, and operator in `PROJECT_PLAN.md`.
- Run the existing smoke suites against the applied project:
  - `npm run test:campaigns`
  - `npm run test:productivity`
  - `npm run test:automations`
  - `npm run test:rls`
  - `npm run test:booking`
  - `npm run test:public`
- Browser-test the public page, booking, form submission, resource download,
  campaign editor, task flow, and integrations dashboard.

### Acceptance criteria

- Every migration is applied once and appears in the Supabase migration history.
- All smoke suites pass with no skipped database-dependent checks.
- The authenticated and anonymous access tests confirm organization isolation.
- A failed migration has a documented recovery step before another migration is applied.

## Workstream 2 — Campaign scheduling and email delivery

**Status:** local scheduler implemented; end-to-end proof pending.

### Tasks

- Keep a future date/time mandatory for scheduled campaigns. Reject blank and
  past dates server-side.
- For local validation, start these processes separately:

  ```powershell
  npm run dev
  npm run dev:campaign-scheduler
  ```

- Create a disposable campaign addressed only to a controlled test inbox.
- Schedule it two to five minutes ahead, confirm the worker processes it once,
  and verify the campaign/recipient states and provider log.
- Repeat with no `RESEND_API_KEY` and verify the documented no-send behavior is
  clearly understood before production use.
- Verify Resend domain authentication: SPF, DKIM, DMARC, sender address, and
  webhook secret.
- Before moving to Vercel Pro, keep frequent cron entries out of `vercel.json`.
  The paid configuration is preserved in `vercel.paid-cron.example.jsonc` and
  must be enabled for both campaigns and automations together.

### Acceptance criteria

- A scheduled campaign fires within the configured local polling interval.
- It does not send twice when the worker is restarted or overlaps.
- A campaign with no recipients, an invalid audience, a cancelled campaign, and
  a provider failure all leave clear, correct statuses.
- A real test email is visible in Resend logs and in the controlled inbox.

## Workstream 3 — Reminders and notifications

**Status:** in progress — appointment reminder recipient targeting is implemented in code; live verification and task reminders remain.

### Required implementation

- [x] Add explicit appointment-reminder recipients to the automation configuration:
  - customer/contact email;
  - business inbox;
  - selected organization members;
  - optionally the appointment owner when appointment ownership is introduced.
- [x] Let an administrator independently configure timing and recipients for each
      appointment reminder step (for example, customer at 24 hours and staff at
      two hours).
- [ ] Add task due-date reminders for the assigned user, with configurable timing.
- Add database-level idempotency for every reminder type and an observable
  delivery result (queued, sent, skipped, failed, last error).
- Test cancellation, rescheduling, completed appointments, missing emails,
  unsubscribed contacts, timezone boundaries, and concurrent worker runs.

### Acceptance criteria

- A customer and selected staff member receive only the reminders configured
  for them.
- Cancelled/completed appointments never generate a reminder.
- Rescheduling changes the effective reminder time without duplicating delivery.
- A task reminder goes only to its current assignee and is not sent for a
  completed/cancelled task.

## Workstream 4 — Integrations and calendar safety

**Status:** implementation exists; live verification pending.

### Tasks

- Connect a controlled HubSpot account and verify a paginated import.
- Connect Google Calendar and Calendly with least-privilege credentials.
- Confirm imported busy events remove public booking slots.
- Re-import the same source and confirm it is idempotent.
- Revoke each connection and verify tokens/data are handled as designed.

### Acceptance criteria

- Imports neither overwrite nor silently merge duplicate contacts.
- A busy external event cannot be booked over.
- Tokens are unavailable to anonymous users and non-members.

## Workstream 5 — Security, privacy, and quality

**Status:** launch blocker; not started as a complete pass.

### Tasks

- Audit each Server Action and Route Handler for authentication, authorization,
  organization scoping, input validation, and error disclosure.
- Verify public rate limits, spam controls, booking token isolation, and upload
  file-type/size enforcement.
- Re-run RLS tests after every schema migration and inspect storage policies.
- Add privacy policy and terms pages.
- Implement a documented data export and deletion workflow.
- Test unsubscribe handling end-to-end.
- Run mobile/browser QA on public pages, booking, forms, embedded widgets, and
  dashboard basics.
- Perform load/soak checks for contact imports and campaign delivery.
- Configure production monitoring, error tracking, database backups, and an
  incident contact.

### Acceptance criteria

- No service-role value is emitted to browser bundles or logs.
- An anonymous user cannot read another organization’s data or booking details.
- A user can export/delete data through an approved operational workflow.
- Core flows work on current mobile Safari, Chrome, and desktop Chrome/Edge.

## Workstream 6 — First-client onboarding and observation

**Status:** begins only after Workstreams 1–5 pass.

### Tasks

- Configure the client organization, owner/admin, branding, services,
  availability, forms, resources, templates, and automations.
- Import contacts and review duplicates before communicating with them.
- Publish and test the real public site, booking flow, forms, resources, and
  unsubscribe page.
- Send one controlled campaign before a broader campaign.
- Run a structured observation period and capture usability issues, missing
  workflows, performance issues, and requested integrations.

### Acceptance criteria

- The client can complete the MVP success checklist without developer help.
- Observed gaps are recorded as reusable product needs, not client-specific
  code changes.

## Recommended next advanced feature — Lead routing and SLA escalation

Build this only after the launch blockers above pass.

### Problem solved

New leads can arrive from forms, bookings, resources, imports, and manual
entry. Today, follow-up can still depend on someone noticing them.

### Proposed capability

- Routing rules based on form, service, source, tag, lead stage, or geography.
- Assignment targets: named staff member, round-robin team, or fallback owner.
- SLA timers that create a follow-up task and escalate if no activity occurs.
- Escalation notifications to the assignee and manager.
- Audit trail explaining why a lead was assigned/escalated.
- Reporting: first-response time, SLA compliance, reassignment rate, and
  unowned-lead count.

### Design constraints

- Rules remain organization configuration, never client-specific code.
- Assignments must be transaction-safe and idempotent.
- Staff availability and role permissions must be verified at execution time.
- Do not add AI decision-making until deterministic routing has proven useful.

## Explicitly deferred

Do not begin these before the first-client observation period:

- self-service organization provisioning, SaaS billing, and platform admin;
- custom domains/subdomain routing at scale;
- MFA, social login, invitations, and configurable role permissions;
- two-way inbox/SMS/AI agents;
- industry-specific functionality such as MLS or transaction management.
