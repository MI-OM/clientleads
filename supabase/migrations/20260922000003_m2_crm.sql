-- =====================================================================
-- M2 — CRM: contacts, tags, custom_fields, contact_custom_values, leads,
--       activities + RLS + auto-activity triggers + config seed.
--
-- PRD §10–15, §36–38, §42–46, §54, §60–61. Fully idempotent — safe to
-- re-paste over an existing schema.
--
-- RLS follows the M1 template: membership checks via SECURITY DEFINER
-- helpers (is_org_member / is_org_admin from 0001). Every table gets
-- SELECT/INSERT/UPDATE/DELETE policies scoped to the organization.
--
-- Activities are written by SECURITY DEFINER trigger helpers so EVERY
-- contact/lead change lands on the timeline even if it bypasses the app
-- (PRD §13, §38). log_activity() guards against cross-org writes.
-- =====================================================================

-- ── contacts (PRD §42) ────────────────────────────────────────────────
create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  first_name       text not null default '',
  last_name        text not null default '',
  email            text,
  phone            text,
  company          text,
  address          text,
  city             text,
  province         text,
  country          text,
  postal_code      text,
  contact_type     text not null default 'Lead',
  lead_status      text not null default 'New',
  source           text not null default 'Manual entry',
  assigned_user_id uuid references auth.users (id) on delete set null,
  notes            text,
  marketing_opt_in boolean not null default true,
  unsubscribed_at  timestamptz,
  archived_at      timestamptz,          -- soft delete (M2)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists contacts_org_idx on public.contacts (organization_id);
create index if not exists contacts_email_idx on public.contacts (email);
create index if not exists contacts_phone_idx on public.contacts (phone);
create index if not exists contacts_email_lower_idx on public.contacts (lower(email)) where email is not null;
create index if not exists contacts_org_archived_idx on public.contacts (organization_id, archived_at);

alter table public.contacts enable row level security;
drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ── tags (PRD §43) ────────────────────────────────────────────────────
create table if not exists public.tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  description     text,
  created_at      timestamptz not null default now()
);

create unique index if not exists tags_org_name_lower_idx on public.tags (organization_id, lower(name));
create index if not exists tags_org_idx on public.tags (organization_id);

alter table public.tags enable row level security;

-- contact_tags (PRD §43)
create table if not exists public.contact_tags (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);

create index if not exists contact_tags_tag_idx on public.contact_tags (tag_id);

alter table public.contact_tags enable row level security;

-- ── custom_fields (PRD §44) ───────────────────────────────────────────
create table if not exists public.custom_fields (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type     text not null default 'contact' check (entity_type in ('contact', 'lead', 'appointment', 'service')),
  name            text not null,
  field_key       text not null,
  field_type      text not null check (field_type in ('text', 'number', 'date', 'boolean', 'dropdown', 'multi_select')),
  options         jsonb not null default '[]'::jsonb,   -- dropdown / multi_select choices
  required        boolean not null default false,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index if not exists custom_fields_org_entity_key_idx
  on public.custom_fields (organization_id, entity_type, field_key);
create index if not exists custom_fields_org_idx on public.custom_fields (organization_id);

alter table public.custom_fields enable row level security;

-- ── contact_custom_values (PRD §45) ───────────────────────────────────
create table if not exists public.contact_custom_values (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  contact_id       uuid not null references public.contacts (id) on delete cascade,
  custom_field_id  uuid not null references public.custom_fields (id) on delete cascade,
  value            jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (contact_id, custom_field_id)
);

create index if not exists contact_custom_values_contact_idx on public.contact_custom_values (contact_id);
create index if not exists contact_custom_values_field_idx on public.contact_custom_values (custom_field_id);

alter table public.contact_custom_values enable row level security;
drop trigger if exists contact_custom_values_set_updated_at on public.contact_custom_values;
create trigger contact_custom_values_set_updated_at
  before update on public.contact_custom_values
  for each row execute function public.set_updated_at();

-- ── leads (PRD §46) ───────────────────────────────────────────────────
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  contact_id        uuid references public.contacts (id) on delete set null,
  stage             text not null default 'New',
  source            text not null default 'Manual entry',
  priority          text not null default 'Normal',
  assigned_user_id  uuid references auth.users (id) on delete set null,
  expected_value    numeric(12,2),
  next_follow_up_at timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists leads_org_idx on public.leads (organization_id);
create index if not exists leads_stage_idx on public.leads (organization_id, stage);
create index if not exists leads_assignee_idx on public.leads (assigned_user_id);

alter table public.leads enable row level security;
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ── activities (PRD §54 — generic event table) ────────────────────────
create table if not exists public.activities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id      uuid references public.contacts (id) on delete set null,
  lead_id         uuid references public.leads (id) on delete set null,
  user_id         uuid references auth.users (id) on delete set null,
  activity_type   text not null,
  subject         text,
  description     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists activities_org_idx on public.activities (organization_id);
create index if not exists activities_contact_idx on public.activities (organization_id, contact_id);
create index if not exists activities_lead_idx on public.activities (organization_id, lead_id);
create index if not exists activities_created_idx on public.activities (organization_id, created_at desc);

alter table public.activities enable row level security;

-- =====================================================================
-- RLS policies — member can read/write their org's rows; the M1 helpers
-- keep this recursive-policy-free.
-- =====================================================================

-- contacts
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select
  using (public.is_org_member(organization_id));
drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert
  with check (public.is_org_member(organization_id));
drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete
  using (public.is_org_member(organization_id));

-- tags
drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags for select
  using (public.is_org_member(organization_id));
drop policy if exists tags_insert on public.tags;
create policy tags_insert on public.tags for insert
  with check (public.is_org_member(organization_id));
drop policy if exists tags_update on public.tags;
create policy tags_update on public.tags for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
drop policy if exists tags_delete on public.tags;
create policy tags_delete on public.tags for delete
  using (public.is_org_member(organization_id));

-- contact_tags — scoped through the linked contact (orgs must match)
drop policy if exists contact_tags_select on public.contact_tags;
create policy contact_tags_select on public.contact_tags for select
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tags.contact_id and public.is_org_member(c.organization_id)
    )
  );
drop policy if exists contact_tags_insert on public.contact_tags;
create policy contact_tags_insert on public.contact_tags for insert
  with check (
    exists (
      select 1 from public.contacts c join public.tags t on t.id = contact_tags.tag_id
      where c.id = contact_tags.contact_id
        and c.organization_id = t.organization_id
        and public.is_org_member(c.organization_id)
    )
  );
drop policy if exists contact_tags_update on public.contact_tags;
create policy contact_tags_update on public.contact_tags for update
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tags.contact_id and public.is_org_member(c.organization_id)
    )
  );
drop policy if exists contact_tags_delete on public.contact_tags;
create policy contact_tags_delete on public.contact_tags for delete
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tags.contact_id and public.is_org_member(c.organization_id)
    )
  );

-- custom_fields
drop policy if exists custom_fields_select on public.custom_fields;
create policy custom_fields_select on public.custom_fields for select
  using (public.is_org_member(organization_id));
drop policy if exists custom_fields_insert on public.custom_fields;
create policy custom_fields_insert on public.custom_fields for insert
  with check (public.is_org_member(organization_id));
drop policy if exists custom_fields_update on public.custom_fields;
create policy custom_fields_update on public.custom_fields for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
drop policy if exists custom_fields_delete on public.custom_fields;
create policy custom_fields_delete on public.custom_fields for delete
  using (public.is_org_member(organization_id));

-- contact_custom_values — scoped through the linked contact
drop policy if exists contact_custom_values_select on public.contact_custom_values;
create policy contact_custom_values_select on public.contact_custom_values for select
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_custom_values.contact_id and public.is_org_member(c.organization_id)
    )
  );
drop policy if exists contact_custom_values_insert on public.contact_custom_values;
create policy contact_custom_values_insert on public.contact_custom_values for insert
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_custom_values.contact_id and public.is_org_member(c.organization_id)
    )
  );
drop policy if exists contact_custom_values_update on public.contact_custom_values;
create policy contact_custom_values_update on public.contact_custom_values for update
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_custom_values.contact_id and public.is_org_member(c.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_custom_values.contact_id and public.is_org_member(c.organization_id)
    )
  );
drop policy if exists contact_custom_values_delete on public.contact_custom_values;
create policy contact_custom_values_delete on public.contact_custom_values for delete
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_custom_values.contact_id and public.is_org_member(c.organization_id)
    )
  );

-- leads
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select
  using (public.is_org_member(organization_id));
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert
  with check (public.is_org_member(organization_id));
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete
  using (public.is_org_member(organization_id));

-- activities — select scoped to org; inserts flow through log_activity()
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select
  using (public.is_org_member(organization_id));
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert
  with check (public.is_org_member(organization_id));
drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities for delete
  using (public.is_org_admin(organization_id));

-- profiles: allow workspace members to read each other's names (timeline
-- attribution, assignee pickers). Own-row policies from 0001 still cover
-- update; this adds a same-org SELECT without weakening per-user editing.
drop policy if exists profiles_select_org_member on public.profiles;
create policy profiles_select_org_member on public.profiles for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.user_id = profiles.id
        and public.is_org_member(m.organization_id)
    )
  );

-- =====================================================================
-- Activity helpers + auto-logging triggers (PRD §13, §38)
-- =====================================================================

-- Generic writer used by the app (notes) and by the triggers below.
-- SECURITY DEFINER + member guard: prevents a member from writing
-- activities into another org, while still allowing the triggers (and
-- future anon/public form flows, where auth.uid() is null) to log.
-- NB: every parameter AFTER a defaulted one must also have a default
-- (Postgres error 42P13). p_activity_type is defaulted to null purely to
-- satisfy that ordering rule; the activities.activity_type column is
-- NOT NULL, so a missing type still fails at insert time.
create or replace function public.log_activity(
  p_organization_id uuid,
  p_contact_id      uuid default null,
  p_lead_id         uuid default null,
  p_activity_type   text default null,
  p_subject         text default null,
  p_description     text default null,
  p_metadata        jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is not null and not public.is_org_member(p_organization_id) then
    raise exception 'RLS: not a member of organization %', p_organization_id;
  end if;

  insert into public.activities (
    organization_id, contact_id, lead_id, user_id,
    activity_type, subject, description, metadata
  )
  values (
    p_organization_id, p_contact_id, p_lead_id, auth.uid(),
    p_activity_type, p_subject, p_description, p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- contacts: created / updated / deleted
create or replace function public.handle_contact_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[];
  v_full_name text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_full_name := coalesce(nullif(trim(new.first_name || ' ' || new.last_name), ''), 'Unnamed contact');
  else
    v_full_name := coalesce(nullif(trim(old.first_name || ' ' || old.last_name), ''), 'Unnamed contact');
  end if;

  if tg_op = 'INSERT' then
    perform public.log_activity(
      new.organization_id, new.id, null, 'contact_created', 'Contact created', v_full_name);
  elsif tg_op = 'UPDATE' then
    select array_agg(k) into v_changed
    from (
      select k from (
        select k from jsonb_object_keys(to_jsonb(old)) as t(k)
        union
        select k from jsonb_object_keys(to_jsonb(new)) as t(k)
      ) keys(k)
      where k not in ('updated_at', 'created_at')
        and coalesce(to_jsonb(old) -> k, 'null'::jsonb)
            is distinct from coalesce(to_jsonb(new) -> k, 'null'::jsonb)
    ) changed(k);

    if v_changed is not null and cardinality(v_changed) > 0 then
      perform public.log_activity(
        new.organization_id, new.id, null, 'contact_updated',
        'Contact updated', 'Changed: ' || array_to_string(v_changed, ', '));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_activity(
      old.organization_id, old.id, null, 'contact_deleted', 'Contact deleted', v_full_name);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists contacts_activity on public.contacts;
create trigger contacts_activity
  after insert or update or delete on public.contacts
  for each row execute function public.handle_contact_activity();

-- leads: created / stage changed / updated / deleted
create or replace function public.handle_lead_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[];
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(
      new.organization_id, new.contact_id, new.id, 'lead_created',
      'Lead created', format('Stage: %s', new.stage));
  elsif tg_op = 'UPDATE' then
    if old.stage is distinct from new.stage then
      perform public.log_activity(
        new.organization_id, new.contact_id, new.id, 'lead_stage_changed',
        'Lead stage changed',
        format('Stage changed from %s to %s', old.stage, new.stage),
        jsonb_build_object('from_stage', old.stage, 'to_stage', new.stage));
    end if;

    select array_agg(k) into v_changed
    from (
      select k from (
        select k from jsonb_object_keys(to_jsonb(old)) as t(k)
        union
        select k from jsonb_object_keys(to_jsonb(new)) as t(k)
      ) keys(k)
      where k not in ('updated_at', 'created_at', 'stage')
        and coalesce(to_jsonb(old) -> k, 'null'::jsonb)
            is distinct from coalesce(to_jsonb(new) -> k, 'null'::jsonb)
    ) changed(k);

    if v_changed is not null and cardinality(v_changed) > 0 then
      perform public.log_activity(
        new.organization_id, new.contact_id, new.id, 'lead_updated',
        'Lead updated', 'Changed: ' || array_to_string(v_changed, ', '));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_activity(
      old.organization_id, old.contact_id, old.id, 'lead_deleted', 'Lead deleted', null);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists leads_activity on public.leads;
create trigger leads_activity
  after insert or update or delete on public.leads
  for each row execute function public.handle_lead_activity();

-- contact_tags: tag added / removed
create or replace function public.handle_contact_tag_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_tag  text;
begin
  if tg_op = 'INSERT' then
    select c.organization_id, t.name into v_org, v_tag
    from public.contacts c join public.tags t on t.id = new.tag_id
    where c.id = new.contact_id;

    if v_org is not null then
      perform public.log_activity(
        v_org, new.contact_id, null, 'tag_added', 'Tag added', v_tag,
        jsonb_build_object('tag', v_tag));
    end if;
  elsif tg_op = 'DELETE' then
    select c.organization_id, t.name into v_org, v_tag
    from public.contacts c join public.tags t on t.id = old.tag_id
    where c.id = old.contact_id;

    if v_org is not null then
      perform public.log_activity(
        v_org, old.contact_id, null, 'tag_removed', 'Tag removed', v_tag,
        jsonb_build_object('tag', v_tag));
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists contact_tags_activity on public.contact_tags;
create trigger contact_tags_activity
  after insert or delete on public.contact_tags
  for each row execute function public.handle_contact_tag_activity();

-- =====================================================================
-- Seed config for the first client — tags + custom fields as DATA,
-- never schema (PRD §12: no real-estate hard-coding in core tables).
-- =====================================================================
do $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'first-client';

  if v_org is not null then
    insert into public.tags (organization_id, name)
    select v_org, name
    from unnest(array['Buyer', 'Seller', 'Investor', 'First-Time Buyer',
                      'Halifax', 'Dartmouth', 'Newsletter', 'Past Client']) as t(name)
    on conflict (organization_id, lower(name)) do nothing;

    insert into public.custom_fields (
      organization_id, entity_type, name, field_key, field_type, options, sort_order
    )
    values
      (v_org, 'contact', 'Preferred Area',   'preferred_area',   'text',          '[]'::jsonb, 1),
      (v_org, 'contact', 'Property Type',    'property_type',    'dropdown',      '["House","Condo","Townhouse","Land","Commercial"]'::jsonb, 2),
      (v_org, 'contact', 'Budget',           'budget',           'number',        '[]'::jsonb, 3),
      (v_org, 'contact', 'Buying Timeline',  'buying_timeline',  'dropdown',      '["0-3 months","3-6 months","6-12 months","12+ months"]'::jsonb, 4)
    on conflict (organization_id, entity_type, field_key) do nothing;
  end if;
end $$;

-- =====================================================================
-- Grants — default privileges from 0001 already cover new tables, but
-- re-assert explicitly (idempotent) for safety and documentation.
-- =====================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.log_activity(uuid, uuid, uuid, text, text, text, jsonb) to authenticated;