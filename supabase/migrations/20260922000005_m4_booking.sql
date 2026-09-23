-- =====================================================================
-- M4 — Booking: availability rules, blocked times, appointments, public
--       booking flow (PRD §14, §17–21, §65, §68).
--
-- Design principles (mirrors M3):
--   * Public READS go through SECURITY DEFINER get_available_slots(), the
--     only anon-reachable booking surface — it returns available start
--     times for a service/date, never other customers' data or private
--     calendar internals.
--   * All public WRITES (book / cancel / reschedule) are SECURITY DEFINER
--     RPCs called only from Next server actions with the service role key.
--     They self-validate: org is derived from the service/appointment row,
--     slots are re-checked server-side, and a DB exclusion constraint
--     (btree_gist) makes double-booking impossible even under races.
--   * Booking tokens are random uuids (PRD §68) — the capability to
--     manage an appointment; never guessable URLs.
--   * Single-calendar MVP: org-level availability rules (user_id null),
--     one shared calendar per org until per-staff calendars land.
--
-- Idempotent — safe to re-paste. append-only; no destructive DDL.
-- =====================================================================

-- Exclusion constraints need btree_gist for (uuid =, tstzrange &&).
create extension if not exists btree_gist;

-- ── availability_rules (PRD §17) ─────────────────────────────────────
-- Weekly recurring windows: day of week → open/close. user_id null = the
-- org-wide (MVP) calendar; a future per-staff calendar sets user_id.
create table if not exists public.availability_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete cascade,
  day_of_week     smallint not null check (day_of_week between 0 and 6), -- 0=Sunday (dow)
  start_time      time not null,
  end_time        time not null,
  timezone        text not null default 'America/Halifax',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists availability_rules_org_idx
  on public.availability_rules (organization_id);
create index if not exists availability_rules_org_day_idx
  on public.availability_rules (organization_id, day_of_week) where active = true;

alter table public.availability_rules enable row level security;
drop trigger if exists availability_rules_set_updated_at on public.availability_rules;
create trigger availability_rules_set_updated_at
  before update on public.availability_rules
  for each row execute function public.set_updated_at();

-- ── blocked_times (PRD §18) ──────────────────────────────────────────
-- One-off closures (holidays, maintenance). Over-application is harmless;
-- the slot engine filters by range regardless, so no overlap constraint.
create table if not exists public.blocked_times (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete cascade, -- null = org-wide
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists blocked_times_org_idx
  on public.blocked_times (organization_id, starts_at);

alter table public.blocked_times enable row level security;
drop trigger if exists blocked_times_set_updated_at on public.blocked_times;
create trigger blocked_times_set_updated_at
  before update on public.blocked_times
  for each row execute function public.set_updated_at();

-- ── appointments (PRD §19–21) ────────────────────────────────────────
create table if not exists public.appointments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_id      uuid references public.services (id) on delete set null,
  contact_id      uuid references public.contacts (id) on delete set null,
  lead_id         uuid references public.leads (id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  timezone        text not null,             -- snapshot of the rule tz at booking
  status          text not null default 'Scheduled'
                    check (status in
                      ('Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No-show', 'Rescheduled')),
  customer_name   text not null,             -- snapshot (contact can be edited later)
  customer_email  text not null,
  customer_phone  text,
  notes           text,
  source          text not null default 'Public booking',
  token           uuid not null default gen_random_uuid() unique, -- PRD §68
  ip_hash         text,                      -- salted hash for booking rate limits
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists appointments_org_status_idx
  on public.appointments (organization_id, status, starts_at);
create index if not exists appointments_org_starts_idx
  on public.appointments (organization_id, starts_at);
create index if not exists appointments_token_idx
  on public.appointments (token);
create index if not exists appointments_ip_window_idx
  on public.appointments (organization_id, ip_hash, created_at desc);

alter table public.appointments enable row level security;
drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- Conflict-safety backstop: two live appointments in one org calendar can
-- never overlap, regardless of how they arrive (race-safe, PRD §19
-- "double-booking is impossible"). Cancelled / No-show slots free up.
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    organization_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status not in ('Cancelled', 'No-show'));

-- =====================================================================
-- RLS policies — member reads; owner/admin writes (config + management
-- surfaces). Booking writes that come from the public web flow use the
-- SECURITY DEFINER RPCs below (never anon/authenticated grants on these
-- paths).
-- =====================================================================

-- availability_rules
drop policy if exists availability_rules_select on public.availability_rules;
create policy availability_rules_select on public.availability_rules for select
  using (public.is_org_member(organization_id));
drop policy if exists availability_rules_insert on public.availability_rules;
create policy availability_rules_insert on public.availability_rules for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists availability_rules_update on public.availability_rules;
create policy availability_rules_update on public.availability_rules for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists availability_rules_delete on public.availability_rules;
create policy availability_rules_delete on public.availability_rules for delete
  using (public.is_org_admin(organization_id));

-- blocked_times
drop policy if exists blocked_times_select on public.blocked_times;
create policy blocked_times_select on public.blocked_times for select
  using (public.is_org_member(organization_id));
drop policy if exists blocked_times_insert on public.blocked_times;
create policy blocked_times_insert on public.blocked_times for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists blocked_times_update on public.blocked_times;
create policy blocked_times_update on public.blocked_times for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists blocked_times_delete on public.blocked_times;
create policy blocked_times_delete on public.blocked_times for delete
  using (public.is_org_admin(organization_id));

-- appointments
drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments for select
  using (public.is_org_member(organization_id));
drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists appointments_delete on public.appointments;
create policy appointments_delete on public.appointments for delete
  using (public.is_org_admin(organization_id));

-- =====================================================================
-- get_available_slots — the ONLY anon-reachable booking surface (read).
-- Computes open 15-minute slots for one service on one date after:
--   1. weekly rules (active, org-wide) for that day and their timezone,
--   2. service buffers around appointments,
--   3. blocked times,
--   4. minimum-notice and max-booking-window rules.
-- Returns only start timestamps (jsonb array of ISO strings) — no other
-- customer or calendar data ever leaves.
-- =====================================================================
create or replace function public.get_available_slots(
  p_slug       text,
  p_service_id uuid,
  p_date       date
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_org_id     uuid;
  v_svc        record;
  v_rule       record;
  v_window_end timestamptz;
  v_start      timestamptz;
  v_end        timestamptz;
  v_eff_start  timestamptz;
  v_eff_end    timestamptz;
  v_slots      timestamptz[] := '{}';
  v_any_rule   boolean := false;
begin
  if p_date is null or p_service_id is null then
    return '[]'::jsonb;
  end if;

  select id into v_org_id from public.organizations where slug = p_slug limit 1;
  if v_org_id is null then
    return null;
  end if;

  select * into v_svc from public.services s
  where s.id = p_service_id and s.organization_id = v_org_id
  limit 1;

  if v_svc.id is null or not v_svc.active or not v_svc.booking_enabled then
    return '[]'::jsonb;
  end if;

  v_window_end := now() + (greatest(v_svc.max_booking_window_days, 0) || ' days')::interval;

  for v_rule in
    select * from public.availability_rules r
    where r.organization_id = v_org_id
      and r.user_id is null
      and r.day_of_week = extract(dow from p_date)
      and r.active = true
    order by r.start_time
  loop
    v_any_rule := true;
    v_start := (p_date + v_rule.start_time) at time zone v_rule.timezone;
    loop
      -- stop if the slot would spill past the rule's close
      v_end := v_start + (v_svc.duration_min * interval '1 minute');
      if v_end > ((p_date + v_rule.end_time) at time zone v_rule.timezone) then
        exit;
      end if;
      -- stop once the booking window (max days) is exhausted
      if v_start > v_window_end then
        exit;
      end if;

      -- minimum notice + not in the past
      if v_start >= now() + (v_svc.min_notice_min * interval '1 minute') then
        v_eff_start := v_start - (v_svc.buffer_before_min * interval '1 minute');
        v_eff_end   := v_end   + (v_svc.buffer_after_min  * interval '1 minute');

        -- no overlap with blocked times
        if not exists (
          select 1 from public.blocked_times b
          where b.organization_id = v_org_id
            and b.user_id is null
            and b.starts_at < v_eff_end
            and b.ends_at > v_eff_start
        ) and not exists (
          -- no overlap with live appointments (single org calendar)
          select 1 from public.appointments a
          where a.organization_id = v_org_id
            and a.status not in ('Cancelled', 'No-show')
            and a.starts_at < v_eff_end
            and a.ends_at > v_eff_start
        ) then
          v_slots := array_append(v_slots, v_start);
        end if;
      end if;

      v_start := v_start + interval '15 minutes';
    end loop;
  end loop;

  if not v_any_rule then
    return '[]'::jsonb;
  end if;

  return to_jsonb(v_slots);
end;
$$;

-- =====================================================================
-- book_appointment (PRD §19) — server-action only (service role). Creates/
-- updates contact + lead, records activity, and inserts a conflict-safe
-- appointment. All validation re-runs server-side; a lost race is caught
-- by the exclusion constraint and rolled back (nothing orphaned).
-- Rate limited: 5 bookings per IP hash per hour.
-- =====================================================================
create or replace function public.book_appointment(
  p_service_id uuid,
  p_starts_at  timestamptz,
  p_name       text default null,
  p_email      text default null,
  p_phone      text default null,
  p_notes      text default null,
  p_ip_hash    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_svc        record;
  v_org_id     uuid;
  v_end        timestamptz;
  v_timezone   text;
  v_email      text;
  v_phone      text;
  v_first      text;
  v_last       text;
  v_contact_id uuid;
  v_lead_id    uuid;
  v_appointment_id uuid;
  v_token      uuid;
  v_count      integer;
begin
  select * into v_svc from public.services s where s.id = p_service_id limit 1;
  if v_svc.id is null or not v_svc.active or not v_svc.booking_enabled then
    raise exception 'BOOKING_UNAVAILABLE';
  end if;
  v_org_id := v_svc.organization_id;

  select timezone into v_timezone from public.organizations where id = v_org_id;

  -- Rate limit: 5 bookings per IP hash per rolling hour
  if p_ip_hash is not null then
    select count(*) into v_count from public.appointments a
    where a.organization_id = v_org_id
      and a.ip_hash = p_ip_hash
      and a.created_at > now() - interval '60 minutes';
    if v_count >= 5 then
      raise exception 'BOOKING_RATE_LIMITED';
    end if;
  end if;

  v_email := lower(nullif(trim(p_email), ''));
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'BOOKING_EMAIL_REQUIRED';
  end if;
  v_phone := nullif(trim(p_phone), '');
  v_first := nullif(trim(p_name), '');
  if v_first is null or v_first = '' then
    raise exception 'BOOKING_NAME_REQUIRED';
  end if;
  v_first := regexp_replace(v_first, '\s+', ' ', 'g');
  v_last  := coalesce(nullif(trim(substring(v_first from ' [^ ]+$')), ''), '');
  v_first := coalesce(nullif(trim(regexp_replace(v_first, ' [^ ]+$', '')), ''), '');

  -- Window rules re-validation
  if p_starts_at < now() + (v_svc.min_notice_min * interval '1 minute') then
    raise exception 'BOOKING_SLOT_UNAVAILABLE';
  end if;
  if p_starts_at > now() + (greatest(v_svc.max_booking_window_days, 0) * interval '1 day') then
    raise exception 'BOOKING_SLOT_UNAVAILABLE';
  end if;
  v_end := p_starts_at + (v_svc.duration_min * interval '1 minute');

  -- Must fall inside an ACTIVE weekly rule window (org-wide calendar)
  if not exists (
    select 1 from public.availability_rules r
    where r.organization_id = v_org_id
      and r.user_id is null
      and r.active = true
      and r.day_of_week = extract(dow from p_starts_at at time zone r.timezone)
      and (p_starts_at at time zone r.timezone)::time >= r.start_time
      and (v_end at time zone r.timezone)::time <= r.end_time
  ) then
    raise exception 'BOOKING_SLOT_UNAVAILABLE';
  end if;

  -- All inserts inside a subtransaction so a lost race rolls everything back
  begin
    -- contact: match email or phone digits; else create
    select c.id into v_contact_id
    from public.contacts c
    where c.organization_id = v_org_id
      and (
        (v_email is not null and lower(c.email) = v_email)
        or (v_phone is not null
            and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')
                = regexp_replace(v_phone, '\D', '', 'g'))
      )
    order by c.created_at
    limit 1;

    if v_contact_id is null then
      insert into public.contacts (
        organization_id, first_name, last_name, email, phone, contact_type, source
      )
      values (v_org_id, coalesce(v_first, ''), coalesce(v_last, ''),
              v_email, v_phone, 'Lead', 'Public booking')
      returning id into v_contact_id;
    else
      update public.contacts
      set first_name = case when first_name = '' or first_name is null
                            then coalesce(v_first, first_name) else first_name end,
          last_name  = case when last_name = '' or last_name is null
                            then coalesce(v_last, last_name) else last_name end,
          email      = coalesce(v_email, email),
          phone      = coalesce(v_phone, phone)
      where id = v_contact_id;
    end if;

    -- open lead or new
    select id into v_lead_id
    from public.leads l
    where l.contact_id = v_contact_id and l.stage not in ('Won', 'Lost')
    order by l.created_at desc
    limit 1;

    if v_lead_id is null then
      insert into public.leads (organization_id, contact_id, stage, source)
      values (v_org_id, v_contact_id, 'New', 'Public booking')
      returning id into v_lead_id;
    end if;

    insert into public.appointments (
      organization_id, service_id, contact_id, lead_id,
      starts_at, ends_at, timezone,
      customer_name, customer_email, customer_phone, notes,
      source, ip_hash
    )
    values (
      v_org_id, p_service_id, v_contact_id, v_lead_id,
      p_starts_at, v_end, v_timezone,
      coalesce(nullif(trim(p_name), ''), '') , v_email, v_phone, nullif(trim(p_notes), ''),
      'Public booking', p_ip_hash
    )
    returning id, token into v_appointment_id, v_token;
  exception
    when exclusion_violation then
      raise exception 'BOOKING_SLOT_UNAVAILABLE';
  end;

  perform public.log_activity(
    v_org_id, v_contact_id, v_lead_id, 'appointment_booked',
    format('"%s" booked', v_svc.name),
    format('Scheduled for %s', to_char(p_starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')),
    jsonb_build_object('service_id', p_service_id, 'service_name', v_svc.name,
                       'starts_at', p_starts_at, 'appointment_id', v_appointment_id)
  );

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment_id,
    'token', v_token,
    'starts_at', p_starts_at,
    'ends_at', v_end,
    'service_name', v_svc.name,
    'contact_id', v_contact_id,
    'lead_id', v_lead_id
  );
end;
$$;

-- =====================================================================
-- cancel_appointment (PRD §20) — public manage link by token (service role).
-- =====================================================================
create or replace function public.cancel_appointment(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if p_token is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  select a.* into v_row from public.appointments a
  where a.token = p_token
  limit 1;

  if v_row.id is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;
  if v_row.status in ('Cancelled', 'No-show', 'Completed') then
    raise exception 'APPOINTMENT_NOT_CANCELLABLE';
  end if;

  update public.appointments
  set status = 'Cancelled', updated_at = now()
  where id = v_row.id;

  perform public.log_activity(
    v_row.organization_id, v_row.contact_id, v_row.lead_id, 'appointment_cancelled',
    'Appointment cancelled', format('Scheduled %s cancelled', to_char(v_row.starts_at, 'YYYY-MM-DD HH24:MI')),
    jsonb_build_object('appointment_id', v_row.id, 'status', 'Cancelled')
  );

  return jsonb_build_object('ok', true, 'appointment_id', v_row.id, 'status', 'Cancelled');
end;
$$;

-- =====================================================================
-- reschedule_appointment (PRD §21) — public manage link by token (service
-- role). Moves a Scheduled/Confirmed appointment to a re-validated slot.
-- =====================================================================
create or replace function public.reschedule_appointment(
  p_token      uuid,
  p_new_starts timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  record;
  v_svc  record;
  v_end  timestamptz;
begin
  if p_token is null or p_new_starts is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  select a.* into v_row from public.appointments a
  where a.token = p_token
  limit 1;

  if v_row.id is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;
  if v_row.status in ('Cancelled', 'No-show', 'Completed') then
    raise exception 'APPOINTMENT_NOT_RESCHEDULABLE';
  end if;

  select * into v_svc from public.services s where s.id = v_row.service_id limit 1;
  if v_svc.id is null or not v_svc.active or not v_svc.booking_enabled then
    raise exception 'BOOKING_UNAVAILABLE';
  end if;

  if p_new_starts < now() + (v_svc.min_notice_min * interval '1 minute') then
    raise exception 'BOOKING_SLOT_UNAVAILABLE';
  end if;
  if p_new_starts > now() + (greatest(v_svc.max_booking_window_days, 0) * interval '1 day') then
    raise exception 'BOOKING_SLOT_UNAVAILABLE';
  end if;

  v_end := p_new_starts + (v_svc.duration_min * interval '1 minute');

  -- Must fall inside an ACTIVE weekly rule window (org-wide calendar)
  if not exists (
    select 1 from public.availability_rules r
    where r.organization_id = v_row.organization_id
      and r.user_id is null
      and r.active = true
      and r.day_of_week = extract(dow from p_new_starts at time zone r.timezone)
      and (p_new_starts at time zone r.timezone)::time >= r.start_time
      and (v_end at time zone r.timezone)::time <= r.end_time
  ) then
    raise exception 'BOOKING_SLOT_UNAVAILABLE';
  end if;

  begin
    update public.appointments a
    set starts_at = p_new_starts, ends_at = v_end, updated_at = now()
    where a.id = v_row.id
      and not exists (
        select 1 from public.appointments x
        where x.organization_id = v_row.organization_id
          and x.id <> v_row.id
          and x.status not in ('Cancelled', 'No-show')
          and x.starts_at < v_end + (v_svc.buffer_after_min * interval '1 minute')
          and x.ends_at   > p_new_starts - (v_svc.buffer_before_min * interval '1 minute')
      )
      and not exists (
        select 1 from public.blocked_times b
        where b.organization_id = v_row.organization_id
          and b.user_id is null
          and b.starts_at < v_end + (v_svc.buffer_after_min * interval '1 minute')
          and b.ends_at   > p_new_starts - (v_svc.buffer_before_min * interval '1 minute')
      );
    if not found then
      raise exception 'BOOKING_SLOT_UNAVAILABLE';
    end if;
  exception
    when exclusion_violation then
      raise exception 'BOOKING_SLOT_UNAVAILABLE';
  end;

  perform public.log_activity(
    v_row.organization_id, v_row.contact_id, v_row.lead_id, 'appointment_rescheduled',
    'Appointment rescheduled',
    format('Moved from %s to %s',
           to_char(v_row.starts_at, 'MM-DD HH24:MI'),
           to_char(p_new_starts, 'MM-DD HH24:MI')),
    jsonb_build_object('appointment_id', v_row.id, 'new_starts_at', p_new_starts)
  );

  return jsonb_build_object(
    'ok', true, 'appointment_id', v_row.id,
    'starts_at', p_new_starts, 'ends_at', v_end, 'status', v_row.status
  );
end;
$$;

-- =====================================================================
-- get_appointment_by_token — public manage page read (PRD §20–21). Token
-- is the capability (PRD §68); returns ONLY that appointment's own data
-- (its service name, times, status, and the customer's own details) — no
-- other customers or org data ever leaks.
-- =====================================================================
create or replace function public.get_appointment_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_row     record;
  v_svc_name text;
  v_org_name text;
begin
  if p_token is null then
    return null;
  end if;

  select a.* into v_row from public.appointments a
  where a.token = p_token
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  select name into v_svc_name from public.services s where s.id = v_row.service_id;
  select name into v_org_name from public.organizations o where o.id = v_row.organization_id;

  return jsonb_build_object(
    'id', v_row.id,
    'token', v_row.token,
    'status', v_row.status,
    'service_id', v_row.service_id,
    'service_name', coalesce(v_svc_name, 'Appointment'),
    'org_name', v_org_name,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'timezone', v_row.timezone,
    'customer_name', v_row.customer_name,
    'customer_email', v_row.customer_email,
    'customer_phone', v_row.customer_phone,
    'notes', v_row.notes,
    'source', v_row.source,
    'created_at', v_row.created_at
  );
end;
$$;

-- =====================================================================
-- get_public_page — re-declared to also project org.timezone so the
-- booking wizard can render slot times in the business's timezone. Same
-- leak-free projection as M3, plus that one always-safe field.
-- =====================================================================
create or replace function public.get_public_page(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_org_id uuid;
  v_result jsonb;
begin
  select id into v_org_id from public.organizations
  where slug = p_slug
  limit 1;

  if v_org_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'org', jsonb_build_object(
      'id', o.id, 'name', o.name, 'slug', o.slug,
      'logo_url', o.logo_url, 'description', o.description,
      'email', o.email, 'phone', o.phone,
      'address', o.address, 'city', o.city, 'province', o.province,
      'country', o.country, 'postal_code', o.postal_code,
      'website_url', o.website_url, 'social_links', o.social_links,
      'primary_color', o.primary_color, 'secondary_color', o.secondary_color,
      'timezone', o.timezone
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'duration_min', s.duration_min, 'price', s.price, 'currency', s.currency,
        'location_type', s.location_type, 'location_details', s.location_details,
        'booking_enabled', s.booking_enabled
      ) order by s.sort_order, s.name)
      from public.services s
      where s.organization_id = v_org_id and s.active = true
    ), '[]'::jsonb),
    'forms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'slug', f.slug, 'description', f.description,
        'fields', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ff.id, 'label', ff.label, 'field_key', ff.field_key,
            'field_type', ff.field_type, 'required', ff.required,
            'options', ff.options, 'placeholder', ff.placeholder
          ) order by ff.sort_order)
          from public.form_fields ff
          where ff.form_id = f.id
        ), '[]'::jsonb)
      ) order by f.created_at)
      from public.public_forms f
      where f.organization_id = v_org_id and f.active = true
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'description', r.description,
        'gated', r.gated, 'download_count', r.download_count,
        'file_name', r.file_name
      ) order by r.created_at desc)
      from public.resources r
      where r.organization_id = v_org_id
        and r.published = true
        and r.visibility = 'public'
    ), '[]'::jsonb)
  ) into v_result
  from public.organizations o
  where o.id = v_org_id;

  return v_result;
end;
$$;

-- =====================================================================
-- Grants: anon gets ONLY the read RPCs. Every write goes through server
-- actions with the service role. Re-assert table grants (new tables).
-- =====================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

grant execute on function public.get_available_slots(text, uuid, date) to anon, authenticated;
grant execute on function public.get_appointment_by_token(uuid) to anon, authenticated;
grant execute on function public.book_appointment(uuid, timestamptz, text, text, text, text, text) to service_role;
grant execute on function public.cancel_appointment(uuid) to service_role;
grant execute on function public.reschedule_appointment(uuid, timestamptz) to service_role;

-- Postgres grants EXECUTE on new functions to PUBLIC by default — that would
-- let anon call the WRITE RPCs directly (bypassing server actions), so revoke
-- it everywhere and re-grant only the intended roles (idempotent; this also
-- closes the same pre-existing hole for the M3 write RPCs).
revoke execute on function public.get_public_page(text) from public;
revoke execute on function public.get_available_slots(text, uuid, date) from public;
revoke execute on function public.get_appointment_by_token(uuid) from public;
revoke execute on function public.submit_public_form(text, text, jsonb) from public;
revoke execute on function public.request_resource_download(uuid, text, text, text) from public;
revoke execute on function public.record_resource_download(uuid, uuid) from public;
revoke execute on function public.book_appointment(uuid, timestamptz, text, text, text, text, text) from public;
revoke execute on function public.cancel_appointment(uuid) from public;
revoke execute on function public.reschedule_appointment(uuid, timestamptz) from public;

grant execute on function public.get_public_page(text) to anon, authenticated;
grant execute on function public.get_available_slots(text, uuid, date) to anon, authenticated;
grant execute on function public.get_appointment_by_token(uuid) to anon, authenticated;
grant execute on function public.submit_public_form(text, text, jsonb) to service_role;
grant execute on function public.request_resource_download(uuid, text, text, text) to service_role;
grant execute on function public.record_resource_download(uuid, uuid) to service_role;
grant execute on function public.book_appointment(uuid, timestamptz, text, text, text, text, text) to service_role;
grant execute on function public.cancel_appointment(uuid) to service_role;
grant execute on function public.reschedule_appointment(uuid, timestamptz) to service_role;

-- =====================================================================
-- Seed (first-client demo): an org-wide weekly calendar and one bookable
-- service so the public flow is testable right after the migration lands.
-- =====================================================================
do $$
declare
  v_org uuid;
  v_has_rules boolean;
  v_has_service boolean;
begin
  select id into v_org from public.organizations where slug = 'first-client';
  if v_org is null then
    return;
  end if;

  select exists(
    select 1 from public.availability_rules r where r.organization_id = v_org and r.user_id is null
  ) into v_has_rules;
  if not v_has_rules then
    insert into public.availability_rules
      (organization_id, day_of_week, start_time, end_time, timezone, active)
    values
      (v_org, 1, '09:00', '17:00', 'America/Halifax', true),
      (v_org, 2, '09:00', '17:00', 'America/Halifax', true),
      (v_org, 3, '09:00', '17:00', 'America/Halifax', true),
      (v_org, 4, '09:00', '17:00', 'America/Halifax', true),
      (v_org, 5, '09:00', '17:00', 'America/Halifax', true);
  end if;

  select exists(
    select 1 from public.services s
    where s.organization_id = v_org and s.name = 'Initial consultation'
  ) into v_has_service;
  if not v_has_service then
    insert into public.services (
      organization_id, name, description, duration_min, price, currency,
      location_type, location_details, booking_enabled,
      min_notice_min, max_booking_window_days, active, sort_order
    )
    values (
      v_org, 'Initial consultation',
      'A 30-minute call to talk about your goals and how we can help.',
      30, null, 'CAD', 'video', 'Video call', true, 1440, 90, true, 1
    );
  end if;
end $$;