-- =====================================================================
-- M6.5 — Advanced automations (workflow engine upgrade)
--
-- Builds on 20260923000007_m6_productivity.sql. Extends the automation
-- engine from "one flat action (create follow-up task)" to a step-based
-- workflow model while keeping every legacy seed/config working.
--
-- What's added:
--   1. 4 new triggers: contact_created, lead_stage_changed,
--      appointment_cancelled, appointment_no_show (8 trigger types total).
--   2. action_config v2: {steps:[...], conditions:{...}}.
--      Step types:
--        create_task         - follow-up task (title, due_in_days,
--                              priority, assignee_id)
--        add_tags            - ensure tag by name + link to contact
--        add_activity        - timeline activity
--        update_lead_stage   - move linked lead to a stage
--        send_email          - template email to the contact (app-drained)
--        notify              - business notification (app-drained)
--      Every step supports delay_hours (0 = immediate).
--      Conditions:
--        scope_form_id / scope_service_id / scope_resource_id
--        only_new_contacts (created within ~5 min of the event)
--        skip_unsubscribed  (no email/notify steps for opt-outs)
--        lead_stage         (lead_stage_changed: only when moving INTO it)
--   3. execution model:
--      * DB-side steps (create_task/add_tags/add_activity/
--        update_lead_stage) with delay_hours = 0 run SYNCHRONOUSLY in the
--        trigger — same reliability/observability contract as M6.
--      * Everything else is enqueued into public.automation_actions and
--        processed by the app cron route (/api/automations/run, gated on
--        CRON_SECRET, mirrors /api/campaigns/schedule).
--   4. Legacy flat configs {"create_follow_up_task": true, ...} are
--      normalized at read time → identical behaviour to 0007.
--
-- Security: anon has zero grants; automation_actions has a member SELECT
-- policy only (writes via SECURITY DEFINER RPC); all new functions revoke
-- PUBLIC EXECUTE (M4 idiom). Idempotent — safe to re-paste.
-- =====================================================================

-- ── 1) widen the trigger-type check (drop + re-add, idempotent) ───────
alter table public.automations
  drop constraint if exists automations_trigger_type_check;

alter table public.automations
  add constraint automations_trigger_type_check
  check (trigger_type in
    ('appointment_booked', 'form_submitted',
     'appointment_completed', 'resource_downloaded',
     'contact_created', 'lead_stage_changed',
     'appointment_cancelled', 'appointment_no_show'));

-- ── 2) automation_actions queue ───────────────────────────────────────
-- Internal table written ONLY through enqueue_automation_action() (the
-- trigger path) and service-role app code. Members may read it for
-- observability; no direct write policies exist.
create table if not exists public.automation_actions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trigger_type    text not null,
  step            jsonb not null,
  contact_id      uuid references public.contacts (id) on delete set null,
  lead_id         uuid references public.leads (id) on delete set null,
  appointment_id  uuid references public.appointments (id) on delete set null,
  run_at          timestamptz not null default now(),
  status          text not null default 'pending'
                    check (status in ('pending', 'done', 'failed')),
  attempts        integer not null default 0,
  last_error      text,
  executed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists automation_actions_queue_idx
  on public.automation_actions (status, run_at);
create index if not exists automation_actions_org_idx
  on public.automation_actions (organization_id, created_at desc);

alter table public.automation_actions enable row level security;

drop policy if exists automation_actions_select on public.automation_actions;
create policy automation_actions_select on public.automation_actions for select
  using (public.is_org_member(organization_id));

-- =====================================================================
-- 3) helpers
-- =====================================================================

-- ── ensure_contact_tag ────────────────────────────────────────────────
-- SECURITY DEFINER so triggers/queue processing can tag contacts without
-- tripping RLS. Tag is created on demand if it doesn't exist (org-scoped,
-- case-insensitive unique), then linked. Idempotent per (contact, tag).
create or replace function public.ensure_contact_tag(
  p_org_id    uuid,
  p_contact_id uuid,
  p_tag_name  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag_id uuid;
begin
  if p_org_id is null or p_contact_id is null or nullif(trim(p_tag_name), '') is null then
    return null;
  end if;

  select id into v_tag_id
  from public.tags t
  where t.organization_id = p_org_id
    and lower(t.name) = lower(trim(p_tag_name))
  limit 1;

  if v_tag_id is null then
    insert into public.tags (organization_id, name, description)
    values (p_org_id, trim(p_tag_name), 'Auto-created by automation')
    returning id into v_tag_id;
  end if;

  insert into public.contact_tags (contact_id, tag_id)
  values (p_contact_id, v_tag_id)
  on conflict (contact_id, tag_id) do nothing;

  return v_tag_id;
end;
$$;

-- ── enqueue_automation_action ─────────────────────────────────────────
-- The only insert path into automation_actions (besides service role).
-- `p_run_at` defaults to now() — the app runner skips future rows.
create or replace function public.enqueue_automation_action(
  p_org_id         uuid,
  p_trigger        text,
  p_step           jsonb,
  p_contact_id     uuid default null,
  p_lead_id        uuid default null,
  p_appointment_id uuid default null,
  p_run_at         timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_org_id is null or p_step is null then
    return null;
  end if;

  insert into public.automation_actions (
    organization_id, trigger_type, step,
    contact_id, lead_id, appointment_id, run_at
  )
  values (
    p_org_id, p_trigger, p_step,
    p_contact_id, p_lead_id, p_appointment_id,
    coalesce(p_run_at, now())
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ── run_automation_steps ──────────────────────────────────────────────
-- Shared engine used by every trigger handler.
-- Reads action_config (v2 steps[] OR legacy flat shape), evaluates the
-- conditions, then for each step:
--   * DB-side + delay_hours = 0  → execute inline (synchronous)
--   * otherwise                  → enqueue for the app runner
-- Returns nothing; observability is via the same log_activity helpers the
-- steps use.
create or replace function public.run_automation_steps(
  p_org_id         uuid,
  p_trigger        text,
  p_config         jsonb,
  p_contact_id     uuid default null,
  p_lead_id        uuid default null,
  p_appointment_id uuid default null,
  p_meta           jsonb default '{}'::jsonb  -- form/service/resource ids, is_new_contact, unsubscribed
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conditions  jsonb;
  v_steps       jsonb;
  v_step        jsonb;
  v_type        text;
  v_delay       numeric;
  v_run_at      timestamptz;
  v_scope       text;
  v_scope_key   text;
  v_lead_stage  text;
  v_is_new      boolean;
  v_unsub       boolean;
  n             integer;
  i             integer;
begin
  if p_org_id is null or p_config is null then
    return;
  end if;

  -- normalize to a steps array (legacy flat → one create_task step)
  if jsonb_typeof(p_config -> 'steps') = 'array' then
    v_steps   := p_config -> 'steps';
    v_conditions := p_config -> 'conditions';
  else
    -- legacy 0007 shape
    if (p_config ->> 'create_follow_up_task') <> 'true' then
      return;
    end if;
    v_steps := jsonb_build_array(
      jsonb_build_object(
        'type', 'create_task',
        'title', coalesce(p_meta ->> 'default_title', 'Follow up'),
        'due_in_days', coalesce((p_config ->> 'due_in_days')::int, 0)
      )
    );
    v_conditions := '{}'::jsonb;
  end if;

  -- conditions
  v_scope_key := case
    when p_trigger in ('form_submitted') then 'scope_form_id'
    when p_trigger in ('appointment_booked','appointment_completed',
                       'appointment_cancelled','appointment_no_show') then 'scope_service_id'
    when p_trigger = 'resource_downloaded' then 'scope_resource_id'
    else null
  end;

  if v_scope_key is not null then
    v_scope := v_conditions ->> v_scope_key;
    -- scoped automation: skip unless the payload matches
    if v_scope is not null and v_scope <> ''
       and (p_meta ->> replace(v_scope_key, 'scope_', '')) is distinct from v_scope then
      return;
    end if;
  end if;

  v_lead_stage := v_conditions ->> 'lead_stage';
  if p_trigger = 'lead_stage_changed' and v_lead_stage is not null and v_lead_stage <> ''
     and ((p_meta ->> 'stage') is distinct from v_lead_stage) then
    return;
  end if;

  v_is_new  := coalesce((p_meta ->> 'is_new_contact')::boolean, false);
  if (v_conditions ->> 'only_new_contacts') = 'true' and not v_is_new then
    return;
  end if;

  v_unsub := coalesce((p_meta ->> 'unsubscribed')::boolean, false);

  -- execute / enqueue steps
  n := jsonb_array_length(v_steps);
  for i in 0 .. n - 1 loop
    v_step  := v_steps -> i;
    v_type  := v_step ->> 'type';
    v_delay := coalesce((v_step ->> 'delay_hours')::numeric, 0);

    -- email/notify steps never fire for unsubscribed contacts
    if v_unsub and v_type in ('send_email', 'notify') then
      continue;
    end if;

    if v_delay > 0 then
      v_run_at := now() + make_interval(hours => v_delay);
    elsif v_type in ('send_email', 'notify') then
      -- app-drained even at delay 0 (SQL cannot send mail)
      v_run_at := now();
    else
      v_run_at := null; -- synchronous
    end if;

    if v_run_at is not null then
      perform public.enqueue_automation_action(
        p_org_id, p_trigger, v_step,
        p_contact_id, p_lead_id, p_appointment_id, v_run_at
      );
      continue;
    end if;

    -- synchronous DB-side execution
    if v_type = 'create_task' then
      perform public.create_follow_up_task(
        p_org_id, p_trigger,
        jsonb_build_object(
          'create_follow_up_task', 'true',
          'due_in_days', coalesce((v_step ->> 'due_in_days')::int, 0)
        ),
        coalesce(nullif(v_step ->> 'title', ''), coalesce(p_meta ->> 'default_title', 'Follow up')),
        p_contact_id, p_lead_id, p_appointment_id
      );
    elsif v_type = 'add_tags' and p_contact_id is not null then
      for j in 0 .. jsonb_array_length(coalesce(v_step -> 'tags', '[]'::jsonb)) - 1 loop
        perform public.ensure_contact_tag(
          p_org_id, p_contact_id, v_step -> 'tags' -> j #>> '{}'
        );
      end loop;
    elsif v_type = 'add_activity' then
      perform public.log_activity(
        p_org_id, p_contact_id, p_lead_id,
        coalesce(nullif(v_step ->> 'activity_type', ''), 'automation'),
        coalesce(nullif(v_step ->> 'subject', ''), v_step ->> 'type'),
        v_step ->> 'description',
        jsonb_build_object('source_trigger', p_trigger)
      );
    elsif v_type = 'update_lead_stage' and p_lead_id is not null then
      update public.leads
        set stage = v_step ->> 'stage'
        where id = p_lead_id and organization_id = p_org_id;
      perform public.log_activity(
        p_org_id, p_contact_id, p_lead_id, 'lead_stage_changed',
        'Lead stage changed by automation',
        format('Stage set to %s', v_step ->> 'stage'),
        jsonb_build_object('source_trigger', p_trigger, 'stage', v_step ->> 'stage')
      );
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- 4) trigger handlers
-- =====================================================================

-- contacts → contact_created (INSERT)
create or replace function public.handle_contact_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb;
begin
  select a.action_config into v_config
  from public.automations a
  where a.organization_id = new.organization_id
    and a.trigger_type = 'contact_created'
    and a.active = true
  limit 1;

  perform public.run_automation_steps(
    new.organization_id, 'contact_created', v_config,
    new.id, null, null,
    jsonb_build_object(
      'is_new_contact', true,
      'unsubscribed', new.unsubscribed_at is not null,
      'default_title', format('Follow up: %s %s', new.first_name, new.last_name)
    )
  );
  return new;
end;
$$;

-- leads → lead_stage_changed (INSERT or stage UPDATE)
create or replace function public.handle_lead_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb;
  v_stage  text;
begin
  if tg_op = 'UPDATE' and (old.stage is not distinct from new.stage) then
    return new;
  end if;
  v_stage := new.stage;

  select a.action_config into v_config
  from public.automations a
  where a.organization_id = new.organization_id
    and a.trigger_type = 'lead_stage_changed'
    and a.active = true
  limit 1;

  perform public.run_automation_steps(
    new.organization_id, 'lead_stage_changed', v_config,
    new.contact_id, new.id, null,
    jsonb_build_object(
      'stage', v_stage,
      'is_new_contact', false,
      'unsubscribed', false,
      'default_title', format('Follow up: lead moved to %s', v_stage)
    )
  );
  return coalesce(new, old);
end;
$$;

-- appointments → booked / completed / cancelled / no-show
-- (replaces the 0007 function; keep booked+completed behaviour identical)
create or replace function public.handle_appointment_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trigger text;
  v_config  jsonb;
  v_meta    jsonb;
  v_svc     text;
  v_contact record;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('Scheduled', 'Confirmed') then
      return new;
    end if;
    v_trigger := 'appointment_booked';
    select s.name into v_svc from public.services s where s.id = new.service_id;
    v_meta := jsonb_build_object(
      'service_id', new.service_id,
      'default_title', format('Follow up: %s — %s',
        coalesce(nullif(trim(new.customer_name), ''), 'new booking'),
        coalesce(v_svc, 'Appointment')),
      'unsubscribed', false,
      'is_new_contact', false
    );
  elsif tg_op = 'UPDATE' then
    if old.status <> 'Completed' and new.status = 'Completed' then
      v_trigger := 'appointment_completed';
      v_meta := jsonb_build_object(
        'service_id', new.service_id,
        'default_title', format('Follow up after completed appointment: %s',
          coalesce(nullif(trim(new.customer_name), ''), 'appointment')),
        'unsubscribed', false,
        'is_new_contact', false
      );
    elsif old.status <> 'Cancelled' and new.status = 'Cancelled' then
      v_trigger := 'appointment_cancelled';
      v_meta := jsonb_build_object(
        'service_id', new.service_id,
        'default_title', format('Follow up: appointment cancelled (%s)',
          coalesce(nullif(trim(new.customer_name), ''), 'customer')),
        'unsubscribed', false,
        'is_new_contact', false
      );
    elsif old.status <> 'No-show' and new.status = 'No-show' then
      v_trigger := 'appointment_no_show';
      v_meta := jsonb_build_object(
        'service_id', new.service_id,
        'default_title', format('Follow up: no-show (%s)',
          coalesce(nullif(trim(new.customer_name), ''), 'customer')),
        'unsubscribed', false,
        'is_new_contact', false
      );
    else
      return new;
    end if;
  else
    return new;
  end if;

  -- is the contact new? (comparison against trigger time; ~5 min window)
  if new.contact_id is not null then
    select c.unsubscribed_at, (c.created_at >= now() - interval '5 minutes') as is_new
      into v_contact
    from public.contacts c
    where c.id = new.contact_id;
    if v_contact is not null then
      v_meta := v_meta
        || jsonb_build_object(
             'unsubscribed', v_contact.unsubscribed_at is not null,
             'is_new_contact', coalesce(v_contact.is_new, false)
           );
    end if;
  end if;

  select a.action_config into v_config
  from public.automations a
  where a.organization_id = new.organization_id
    and a.trigger_type = v_trigger
    and a.active = true
  limit 1;

  perform public.run_automation_steps(
    new.organization_id, v_trigger, v_config,
    new.contact_id, new.lead_id, new.id, v_meta
  );

  return coalesce(new, old);
end;
$$;

-- form_submission_events → form_submitted
-- (replaces 0007 function; same legacy behaviour, extended for steps)
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

  perform public.run_automation_steps(
    v_org_id, 'form_submitted', v_config,
    null, null, null,
    jsonb_build_object(
      'form_id', new.form_id,
      'default_title', format('Follow up: form "%s" submitted', coalesce(v_form, 'unknown form')),
      'unsubscribed', false,
      'is_new_contact', false
    )
  );
  return new;
end;
$$;

-- resources → resource_downloaded
-- (replaces 0007 function; same legacy behaviour, extended for steps)
create or replace function public.handle_resource_download_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb;
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

  perform public.run_automation_steps(
    new.organization_id, 'resource_downloaded', v_config,
    null, null, null,
    jsonb_build_object(
      'resource_id', new.id,
      'default_title', format('Follow up: "%s" downloaded', coalesce(new.title, 'resource')),
      'unsubscribed', false,
      'is_new_contact', false
    )
  );
  return new;
end;
$$;

-- ── triggers on the EXISTING tables + new ones (idempotent re-paste) ──
drop trigger if exists contacts_automation on public.contacts;
create trigger contacts_automation
  after insert on public.contacts
  for each row execute function public.handle_contact_automation();

drop trigger if exists leads_automation on public.leads;
create trigger leads_automation
  after insert or update of stage on public.leads
  for each row execute function public.handle_lead_automation();

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
-- 5) grants / revokes (M4 idiom: revoke PUBLIC EXECUTE)
-- =====================================================================
grant select on public.automation_actions to authenticated, service_role;

revoke execute on function public.ensure_contact_tag(uuid, uuid, text) from public;
revoke execute on function public.enqueue_automation_action(uuid, text, jsonb, uuid, uuid, uuid, timestamptz) from public;
revoke execute on function public.run_automation_steps(uuid, text, jsonb, uuid, uuid, uuid, jsonb) from public;
revoke execute on function public.handle_contact_automation() from public;
revoke execute on function public.handle_lead_automation() from public;
revoke execute on function public.handle_appointment_automations() from public;
revoke execute on function public.handle_form_automation() from public;
revoke execute on function public.handle_resource_download_automation() from public;

grant execute on function public.ensure_contact_tag(uuid, uuid, text) to service_role;
grant execute on function public.enqueue_automation_action(uuid, text, jsonb, uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.run_automation_steps(uuid, text, jsonb, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.handle_contact_automation() to service_role;
grant execute on function public.handle_lead_automation() to service_role;
grant execute on function public.handle_appointment_automations() to service_role;
grant execute on function public.handle_form_automation() to service_role;
grant execute on function public.handle_resource_download_automation() to service_role;

-- =====================================================================
-- 6) seeds: advanced automations for the first client (config data only)
-- Widen the existing 4 legacy seeds? No — they must keep their legacy
-- flat shape for the M6 smoke. Add the 4 NEW triggers instead.
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
    (v_org, 'contact_created',        'Contact created',         true,
     '{"steps":[{"type":"create_task","title":"","due_in_days":1,"priority":"Normal"},{"type":"add_tags","tags":["New"]}],"conditions":{"only_new_contacts":false,"skip_unsubscribed":true}}'::jsonb),
    (v_org, 'lead_stage_changed',     'Lead stage changed',      true,
     '{"steps":[{"type":"create_task","title":"","due_in_days":2,"priority":"Normal"}],"conditions":{"lead_stage":"Qualified"}}'::jsonb),
    (v_org, 'appointment_cancelled',  'Appointment cancelled',   true,
     '{"steps":[{"type":"create_task","title":"","due_in_days":1,"priority":"High"}],"conditions":{}}'::jsonb),
    (v_org, 'appointment_no_show',    'Appointment no-show',     true,
     '{"steps":[{"type":"create_task","title":"","due_in_days":1,"priority":"High"},{"type":"notify","kind":"appointment_cancelled"}],"conditions":{}}'::jsonb)
  on conflict (organization_id, trigger_type) do update
    set action_config = excluded.action_config,
        active        = excluded.active;
end $$;