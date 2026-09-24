-- =====================================================================
-- M8 — Integrations & Imports (user-requested, 2026-09-24)
--
-- Extends the M4/M6 booking engine with external connections:
--
--   1. `integrations`           — org-scoped connected accounts
--      (provider: hubspot | google_calendar | calendly). Stores the
--      provider's access/refresh tokens so app-side flows (CRM import,
--      calendar sync) can act on the org's behalf. Tokens are at rest
--      in the tenant table and readable only by org members; writes
--      are owner/admin-only. NOTE (MVP): tokens are stored in plaintext
--      — production hardening (encryption at rest, e.g. Supabase Vault)
--      is an M7 security task.
--
--   2. `imported_calendar_events` — external events pulled in from
--      Google Calendar / Calendly. `blocks_availability` lets imported
--      events hold slots in the booking engine (default true), so the
--      business never double-books against its real calendar. Re-import
--      is idempotent via unique (organization_id, provider,
--      provider_event_id).
--
--   3. get_available_slots / book_appointment gain an imported-event
--      overlap check (CREATE OR REPLACE, same signatures → grants kept).
--      book_appointment also closes the pre-existing blocked_times race
--      (the M4 exclusion constraint only covers appointments).
--
-- Security idiom (unchanged): anon ZERO table grants; reads for org
-- members, writes for owner/admin via RLS; new functions: revoke PUBLIC
-- execute (M4 fix), re-grant to intended roles.
-- =====================================================================

-- ── integrations ───────────────────────────────────────────────────────
create table if not exists public.integrations (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  provider                text not null check (provider in ('hubspot', 'google_calendar', 'calendly')),
  provider_account_id     text not null,
  provider_account_email  text,
  provider_account_name   text,
  access_token            text not null,
  refresh_token           text,
  token_type              text not null default 'Bearer',
  expires_at              timestamptz,
  scopes                  text[] not null default '{}',
  config                  jsonb not null default '{}'::jsonb,
  status                  text not null default 'connected'
                            check (status in ('connected', 'error', 'disconnected')),
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint integrations_org_provider_account_unique
    unique (organization_id, provider, provider_account_id)
);

create index if not exists integrations_org_idx
  on public.integrations (organization_id, provider);

alter table public.integrations enable row level security;

-- member read; owner/admin write (mirrors automations)
drop policy if exists integrations_select on public.integrations;
create policy integrations_select on public.integrations for select
  using (public.is_org_member(organization_id));
drop policy if exists integrations_insert on public.integrations;
create policy integrations_insert on public.integrations for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists integrations_update on public.integrations;
create policy integrations_update on public.integrations for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists integrations_delete on public.integrations;
create policy integrations_delete on public.integrations for delete
  using (public.is_org_admin(organization_id));

-- ── imported_calendar_events ───────────────────────────────────────────
create table if not exists public.imported_calendar_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  provider            text not null check (provider in ('google_calendar', 'calendly')),
  provider_event_id   text not null,
  calendar_id         text,
  title               text not null default 'Busy',
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  timezone            text not null default 'UTC',
  location            text,
  attendees           text[] not null default '{}',
  blocks_availability boolean not null default true,
  raw                 jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint imported_calendar_events_uniq
    unique (organization_id, provider, provider_event_id)
);

create index if not exists imported_calendar_events_org_idx
  on public.imported_calendar_events (organization_id, starts_at);

alter table public.imported_calendar_events enable row level security;

-- member read; owner/admin write (connection-driven, admin-managed)
drop policy if exists imported_calendar_events_select on public.imported_calendar_events;
create policy imported_calendar_events_select on public.imported_calendar_events for select
  using (public.is_org_member(organization_id));
drop policy if exists imported_calendar_events_insert on public.imported_calendar_events;
create policy imported_calendar_events_insert on public.imported_calendar_events for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists imported_calendar_events_update on public.imported_calendar_events;
create policy imported_calendar_events_update on public.imported_calendar_events for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists imported_calendar_events_delete on public.imported_calendar_events;
create policy imported_calendar_events_delete on public.imported_calendar_events for delete
  using (public.is_org_admin(organization_id));

-- =====================================================================
-- Grants: new tables get the standard authenticated DML + service_role
-- (RLS is the enforcement layer — M1 idiom). anon stays zero-grant.
-- =====================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on table public.integrations from anon;
revoke all on table public.imported_calendar_events from anon;

-- =====================================================================
-- get_available_slots — extended: imported calendar events that block
-- availability also remove slots. Signature and grants unchanged, so the
-- anon booking surface keeps working with zero other edits.
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
        ) and not exists (
          -- M8: no overlap with imported external calendar events (M8)
          select 1 from public.imported_calendar_events e
          where e.organization_id = v_org_id
            and e.blocks_availability = true
            and e.starts_at < v_eff_end
            and e.ends_at > v_eff_start
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
-- book_appointment — extended: re-validate against blocked times and
-- imported calendar events before inserting (closes the race window the
-- M4 exclusion constraint never covered for those two hold types).
-- Signature unchanged → existing service_role grant survives.
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

  -- M8: no overlap with org-blocked times or imported calendar events
  -- (defense in depth — the public flow checked get_available_slots, but
  -- the M4 exclusion constraint only guards appointments, leaving a race
  -- for these two hold types).
  if exists (
    select 1 from public.blocked_times b
    where b.organization_id = v_org_id
      and b.user_id is null
      and b.starts_at < v_end
      and b.ends_at > p_starts_at
  ) or exists (
    select 1 from public.imported_calendar_events e
    where e.organization_id = v_org_id
      and e.blocks_availability = true
      and e.starts_at < v_end
      and e.ends_at > p_starts_at
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
-- Revoke PUBLIC execute on the re-created functions (Postgres grants
-- EXECUTE to PUBLIC by default on CREATE OR REPLACE of existing
-- functions only when newly created; re-assert the M4 idiom anyway so
-- re-pasting this file can never re-open anon access), then re-grant
-- the intended roles (idempotent).
-- =====================================================================
revoke execute on function public.get_available_slots(text, uuid, date) from public;
revoke execute on function public.book_appointment(uuid, timestamptz, text, text, text, text, text) from public;
grant execute on function public.get_available_slots(text, uuid, date) to anon, authenticated;
grant execute on function public.book_appointment(uuid, timestamptz, text, text, text, text, text) to service_role;