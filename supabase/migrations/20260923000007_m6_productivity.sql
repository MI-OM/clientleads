-- =====================================================================
-- M6 — Productivity: tasks, basic automations, audit logging + the
--       notifications plumbing hooks (PRD §24, §32, §33, §34, §35, §38;
--       PROJECT_PLAN §M6).
--
-- Design principles (mirrors M2–M4):
--   * Every new table is org-scoped, RLS-enabled, with the canonical
--     member-read / owner-admin-write policy set (is_org_member /
--     is_org_admin SECURITY DEFINER helpers from 0001). The ONE deliberate
--     deviation: `tasks` also lets the assignee or creator UPDATE/DELETE
--     their own rows ("staff manage their own tasks", PRD §24). See the
--     policy comments below.
--   * Basic automations fire from SQL triggers on the EXISTING M3/M4
--     tables (appointments, form_submission_events, resources). No M1–M4
--     RPC is modified or re-created — triggers observe table DML
--     independently, which is exactly why this works without touching
--     book_appointment / submit_public_form / record_resource_download.
--   * Trigger bodies are SECURITY DEFINER functions that read the org's
--     matching active automation, and where configured, insert a
--     follow-up task + log an activity row via the existing log_activity().
--   * audit_logs is write-only through the log_audit() SECURITY DEFINER
--     RPC (server actions / service role); the table has ONLY a SELECT
--     policy, so the default `authenticated` DML grant (0001) is inert
--     for direct writes.
--   * Postgres grants EXECUTE to PUBLIC on new functions by default —
--     every function below is wrapped in `revoke ... from public` +
--     explicit re-grant to the intended role (the M4 fix idiom).
--
-- Fully idempotent / append-only — safe to re-paste in the SQL editor.
-- =====================================================================

-- ── tasks (PRD §24) ────────────────────────────────────────────────────
-- Daily-driver to-do list. Links (contact/lead/appointment) are optional
-- and use on-delete-set-null so deleting a CRM row never orphans a task.
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null,
  description     text,
  contact_id      uuid references public.contacts (id) on delete set null,
  lead_id         uuid references public.leads (id) on delete set null,
  appointment_id  uuid references public.appointments (id) on delete set null,
  assignee_id     uuid references auth.users (id) on delete set null, -- who it's assigned to
  created_by      uuid references auth.users (id) on delete set null, -- who made it (null = automation)
  due_date        timestamptz,                                        -- timestamptz per spec
  priority        text not null default 'Normal'
                    check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  status          text not null default 'Open'
                    check (status in ('Open', 'In Progress', 'Completed', 'Cancelled')),
  notes           text,
  completed_at    timestamptz,          -- set by the app when status → Completed
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tasks_org_idx on public.tasks (organization_id);
create index if not exists tasks_org_status_idx on public.tasks (organization_id, status);
create index if not exists tasks_org_due_idx on public.tasks (organization_id, due_date);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists tasks_contact_idx on public.tasks (contact_id);

alter table public.tasks enable row level security;
drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ── automations (PRD §32) ──────────────────────────────────────────────
-- Controlled triggers only (no visual builder): one config row per
-- (org, trigger_type). action_config drives the trigger function's
-- behaviour, e.g.:
--   {"create_follow_up_task": true, "due_in_days": 3, "notify": true}
create table if not exists public.automations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trigger_type    text not null
                    check (trigger_type in
                      ('appointment_booked', 'form_submitted',
                       'appointment_completed', 'resource_downloaded')),
  name            text,                 -- human label shown in the admin UI
  active          boolean not null default true,
  action_config   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, trigger_type)
);

create index if not exists automations_org_idx on public.automations (organization_id);

alter table public.automations enable row level security;
drop trigger if exists automations_set_updated_at on public.automations;
create trigger automations_set_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();

-- ── audit_logs (PRD §38) ───────────────────────────────────────────────
-- Accountability trail for important admin actions. Written ONLY through
-- the log_audit() SECURITY DEFINER RPC below (the app + service role);
-- no direct-table write policy exists, so the authenticated grant is
-- inert.
create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete set null,
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  before          jsonb,
  after           jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (organization_id, entity_type, entity_id);

alter table public.audit_logs enable row level security;

-- =====================================================================
-- RLS policies
--   tasks:        member read; owner/admin OR assignee/creator write
--                 (PRD §24 "staff can manage their own tasks; owner/admin
--                 all"). Insert stays member-wide so anyone can create or
--                 delegate a task.
--   automations:  member read; owner/admin write (config surface).
--   audit_logs:   member read ONLY — always written via log_audit().
-- =====================================================================

-- tasks
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select
  using (public.is_org_member(organization_id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert
  with check (public.is_org_member(organization_id));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using (
    public.is_org_member(organization_id)
    and (public.is_org_admin(organization_id)
         or assignee_id = auth.uid()
         or created_by = auth.uid())
  )
  with check (
    public.is_org_member(organization_id)
    and (public.is_org_admin(organization_id)
         or assignee_id = auth.uid()
         or created_by = auth.uid())
  );
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete
  using (
    public.is_org_member(organization_id)
    and (public.is_org_admin(organization_id)
         or assignee_id = auth.uid()
         or created_by = auth.uid())
  );

-- automations
drop policy if exists automations_select on public.automations;
create policy automations_select on public.automations for select
  using (public.is_org_member(organization_id));
drop policy if exists automations_insert on public.automations;
create policy automations_insert on public.automations for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists automations_update on public.automations;
create policy automations_update on public.automations for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists automations_delete on public.automations;
create policy automations_delete on public.automations for delete
  using (public.is_org_admin(organization_id));

-- audit_logs — SELECT only; writes go through log_audit()
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select
  using (public.is_org_member(organization_id));

-- =====================================================================
-- log_audit — the ONLY writer for audit_logs (PRD §38).
-- SECURITY DEFINER so triggers/service-role paths can log, but every row
-- must have a real actor who belongs to the audited org. Explicit
-- p_user_id wins (needed by service-role/trigger contexts where
-- auth.uid() is null); anonymous rows are rejected outright.
-- =====================================================================
create or replace function public.log_audit(
  p_organization_id uuid,
  p_user_id         uuid,
  p_action          text,
  p_entity_type     text,
  p_entity_id       uuid,
  p_before          jsonb,
  p_after           jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_actor uuid := coalesce(p_user_id, auth.uid());
begin
  if v_actor is null then
    raise exception 'AUDIT_ACTOR_REQUIRED';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = v_actor
  ) then
    raise exception 'AUDIT_NOT_MEMBER';
  end if;

  insert into public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, before, after
  )
  values (
    p_organization_id, v_actor, p_action, p_entity_type, p_entity_id,
    p_before, p_after
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- =====================================================================
-- get_user_email — resolves an org member's email for notification
-- routing (task-assignment emails come from Next server actions; the
-- dashboard client can't read auth.users). Returns null unless the
-- caller and the target user share an organization.
-- =====================================================================
create or replace function public.get_user_email(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email
  from auth.users u
  where u.id = p_user_id
    and exists (
      select 1 from public.organization_members m
      where m.user_id = u.id
        and public.is_org_member(m.organization_id)
    )
$$;

-- =====================================================================
-- Automation engine (PRD §32)
--
-- create_follow_up_task() is the shared build block used by every trigger:
--   * reads action_config -> if create_follow_up_task <> true, no-ops,
--   * inserts an org-scoped task (due_date = now + due_in_days),
--   * logs a follow_up_task_created activity through log_activity() so the
--     trigger is observable on the timeline.
-- Called only from the SECURITY DEFINER trigger functions below (or by
-- service-role code) — not exposed to anon/authenticated.
-- =====================================================================
create or replace function public.create_follow_up_task(
  p_org_id         uuid,
  p_trigger        text,
  p_config         jsonb,
  p_title          text,
  p_contact_id     uuid default null,
  p_lead_id        uuid default null,
  p_appointment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days    integer;
  v_due     timestamptz;
  v_task_id uuid;
begin
  if p_org_id is null or nullif(trim(p_title), '') is null then
    return null;
  end if;
  if p_config is null or p_config ->> 'create_follow_up_task' <> 'true' then
    return null;
  end if;

  v_days := coalesce((p_config ->> 'due_in_days')::int, 0);
  if v_days > 0 then
    v_due := now() + (v_days || ' days')::interval;
  end if;

  insert into public.tasks (
    organization_id, title, description,
    contact_id, lead_id, appointment_id,
    assignee_id, created_by, due_date, priority, status
  )
  values (
    p_org_id, trim(p_title),
    format('Auto-created by the "%s" automation.', p_trigger),
    p_contact_id, p_lead_id, p_appointment_id,
    null, auth.uid(), v_due, 'Normal', 'Open'
  )
  returning id into v_task_id;

  perform public.log_activity(
    p_org_id, p_contact_id, p_lead_id, 'follow_up_task_created',
    'Follow-up task created', trim(p_title),
    jsonb_build_object('source_trigger', p_trigger, 'task_id', v_task_id)
  );

  return v_task_id;
end;
$$;

-- appointments → appointment_booked (INSERT of a live booking) /
--                appointment_completed (UPDATE to 'Completed')
create or replace function public.handle_appointment_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trigger text;
  v_config  jsonb;
  v_title   text;
  v_svc     text;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('Scheduled', 'Confirmed') then
      return new;
    end if;
    v_trigger := 'appointment_booked';
    select s.name into v_svc from public.services s where s.id = new.service_id;
    v_title := format('Follow up: %s — %s',
                      coalesce(nullif(trim(new.customer_name), ''), 'new booking'),
                      coalesce(v_svc, 'Appointment'));
  elsif tg_op = 'UPDATE' then
    if old.status <> 'Completed' and new.status = 'Completed' then
      v_trigger := 'appointment_completed';
      v_title := format('Follow up after completed appointment: %s',
                        coalesce(nullif(trim(new.customer_name), ''), 'appointment'));
    else
      return new;
    end if;
  else
    return new;
  end if;

  select a.action_config into v_config
  from public.automations a
  where a.organization_id = new.organization_id
    and a.trigger_type = v_trigger
    and a.active = true
  limit 1;

  if v_config ->> 'create_follow_up_task' = 'true' then
    perform public.create_follow_up_task(
      p_org_id         => new.organization_id,
      p_trigger        => v_trigger,
      p_config         => v_config,
      p_title          => v_title,
      p_contact_id     => new.contact_id,
      p_lead_id        => new.lead_id,
      p_appointment_id => new.id
    );
  end if;

  return coalesce(new, old);
end;
$$;

-- form_submission_events → form_submitted.
-- The org is derived from the linked public form. The submission event
-- row is created BEFORE contact/lead resolution in submit_public_form, so
-- the auto task can't link contact/lead yet — linkage stays null (the
-- activity row still records the form name for follow-up).
create or replace function public.handle_form_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_form   text;
  v_config jsonb;
  v_title  text;
begin
  select f.organization_id, f.name into v_org_id, v_form
  from public.public_forms f
  where f.id = new.form_id;

  if v_org_id is null then
    return new;
  end if;

  select a.action_config into v_config
  from public.automations a
  where a.organization_id = v_org_id
    and a.trigger_type = 'form_submitted'
    and a.active = true
  limit 1;

  if v_config ->> 'create_follow_up_task' = 'true' then
    v_title := format('Follow up: form "%s" submitted', coalesce(v_form, 'unknown form'));
    perform public.create_follow_up_task(
      p_org_id  => v_org_id,
      p_trigger => 'form_submitted',
      p_config  => v_config,
      p_title   => v_title
    );
  end if;

  return new;
end;
$$;

-- resources → resource_downloaded. record_resource_download bumps
-- download_count on EVERY download (gated + ungated), so "counter went up"
-- is the observable download event — independent of the M3 RPC.
create or replace function public.handle_resource_download_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb;
  v_title  text;
begin
  if old.download_count >= new.download_count then
    return new;
  end if;

  select a.action_config into v_config
  from public.automations a
  where a.organization_id = new.organization_id
    and a.trigger_type = 'resource_downloaded'
    and a.active = true
  limit 1;

  if v_config ->> 'create_follow_up_task' = 'true' then
    v_title := format('Follow up: "%s" downloaded', coalesce(new.title, 'resource'));
    perform public.create_follow_up_task(
      p_org_id  => new.organization_id,
      p_trigger => 'resource_downloaded',
      p_config  => v_config,
      p_title   => v_title
    );
  end if;

  return new;
end;
$$;

-- ── triggers on the EXISTING tables (idempotent re-paste) ─────────────
drop trigger if exists appointments_automation on public.appointments;
create trigger appointments_automation
  after insert or update on public.appointments
  for each row execute function public.handle_appointment_automations();

drop trigger if exists form_submission_events_automation on public.form_submission_events;
create trigger form_submission_events_automation
  after insert on public.form_submission_events
  for each row execute function public.handle_form_automation();

drop trigger if exists resources_automation on public.resources;
create trigger resources_automation
  after update on public.resources
  for each row execute function public.handle_resource_download_automation();

-- =====================================================================
-- Grant / revoke.
-- Re-assert table grants for the new tables (0001 default privileges
-- already cover them; RLS is the gate — e.g. audit_logs has no INSERT
-- policy so authenticated direct writes stay blocked).
-- Every new function: revoke PUBLIC execute (the real M4 bug), then grant
-- only the intended roles. log_audit + get_user_email are callable from
-- server actions (authenticated session client); the automation helpers
-- are service-role/internal only.
-- =====================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

revoke execute on function public.log_audit(uuid, uuid, text, text, uuid, jsonb, jsonb) from public;
revoke execute on function public.get_user_email(uuid) from public;
revoke execute on function public.create_follow_up_task(uuid, text, jsonb, text, uuid, uuid, uuid) from public;
revoke execute on function public.handle_appointment_automations() from public;
revoke execute on function public.handle_form_automation() from public;
revoke execute on function public.handle_resource_download_automation() from public;

grant execute on function public.log_audit(uuid, uuid, text, text, uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.get_user_email(uuid) to authenticated, service_role;
grant execute on function public.create_follow_up_task(uuid, text, jsonb, text, uuid, uuid, uuid) to service_role;
grant execute on function public.handle_appointment_automations() to service_role;
grant execute on function public.handle_form_automation() to service_role;
grant execute on function public.handle_resource_download_automation() to service_role;

-- =====================================================================
-- Seed: default-enabled automations for the first client (config data,
-- never schema). on-conflict makes this safe to re-run.
-- =====================================================================
do $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'first-client';
  if v_org is null then
    return;
  end if;

  insert into public.automations (organization_id, trigger_type, name, active, action_config)
  values
    (v_org, 'appointment_booked',      'Appointment booked',     true,
     '{"create_follow_up_task": true, "due_in_days": 3, "notify": true}'::jsonb),
    (v_org, 'form_submitted',          'Form submitted',         true,
     '{"create_follow_up_task": true, "due_in_days": 2, "notify": true}'::jsonb),
    (v_org, 'appointment_completed',   'Appointment completed',  true,
     '{"create_follow_up_task": true, "due_in_days": 3, "notify": true}'::jsonb),
    (v_org, 'resource_downloaded',     'Resource downloaded',    true,
     '{"create_follow_up_task": true, "due_in_days": 2, "notify": true}'::jsonb)
  on conflict (organization_id, trigger_type) do nothing;
end $$;