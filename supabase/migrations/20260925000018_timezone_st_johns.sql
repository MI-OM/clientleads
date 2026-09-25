-- 20260925000018_timezone_st_johns.sql
-- Business-region correction (PRD §1 / bug report #2).
-- St. John's is UTC−3:30 (NST) / −2:30 (NDT) — a half-hour offset, NOT
-- Halifax (UTC−4/−3). The old fallback rendered every scheduled time
-- ~+3h+30min off the user's wall clock. This flips the stored defaults
-- and migrates any rows that were created with the Halifax fallback.
--
-- Idempotent: safe to run in any order relative to the other migrations.
-- Requires the `timezone` columns to exist (0001 tenancy core + 0005
-- bookings); guard the UPDATE rows with the same WHERE the DDL implies.

-- 1) Tenancy core: organization.timezone default
ALTER TABLE public.organizations
  ALTER COLUMN timezone SET DEFAULT 'America/St_Johns';

-- 2) Booking/marketing: availability_rules.timezone default
ALTER TABLE public.availability_rules
  ALTER COLUMN timezone SET DEFAULT 'America/St_Johns';

-- 3) Rewrite rows created under the Halifax fallback so existing orgs
--    render their lists (campaigns date column, notification due dates,
--    search hit dates) in the correct region.
UPDATE public.organizations
   SET timezone = 'America/St_Johns'
 WHERE timezone = 'America/Halifax';

UPDATE public.availability_rules
   SET timezone = 'America/St_Johns'
 WHERE timezone = 'America/Halifax';
