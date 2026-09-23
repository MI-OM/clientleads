-- =====================================================================
-- M3 — Public presence: services, public forms, resources, file storage
--       + leak-free public read/write RPCs (PRD §9, §16, §22–23, §30–31,
--       §34(interim), §61, §65, §67).
--
-- Design principles:
--   * anon gets ZERO table grants (M1 rule). The public page reads through
--     SECURITY DEFINER RPC get_public_page() which projects only safe
--     columns; private resources and CRM data are never exposed.
--   * All public WRITES go through server actions (Next.js) that call the
--     SECURITY DEFINER RPCs with the service role key — the anon key can
--     never write anything. The RPCs self-enforce: org is always derived
--     from the form/resource row (never client input), required fields are
--     validated against the form's own config, and submissions are
--     rate-limited per IP hash (PRD §67 — no CAPTCHA in MVP).
--   * Internal tables (form_submission_events, resource_gates) have RLS
--     enabled with NO member policies — only service role / the DEFINER
--     functions can touch them.
--
-- Fully idempotent — safe to re-paste over an existing schema.
-- =====================================================================

-- ── services (PRD §16) ────────────────────────────────────────────────
create table if not exists public.services (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  name                    text not null,
  description             text,
  duration_min            integer not null default 30 check (duration_min > 0),
  price                   numeric(12,2),
  currency                text not null default 'CAD',
  location_type           text not null default 'in-person'
                            check (location_type in ('in-person', 'phone', 'video', 'other')),
  location_details        text,
  -- Booking controls (fields live here now so M4 needs no schema change)
  booking_enabled         boolean not null default false,
  buffer_before_min       integer not null default 0,
  buffer_after_min        integer not null default 0,
  min_notice_min          integer not null default 1440,   -- 24h default
  max_booking_window_days integer not null default 90,
  active                  boolean not null default true,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists services_org_idx on public.services (organization_id);
create index if not exists services_org_active_idx on public.services (organization_id, active);

alter table public.services enable row level security;
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ── public_forms + form_fields (PRD §22) ──────────────────────────────
create table if not exists public.public_forms (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  slug            text not null,
  description     text,
  source          text not null default 'Public website',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists public_forms_org_slug_idx on public.public_forms (organization_id, slug);
create index if not exists public_forms_org_idx on public.public_forms (organization_id);

alter table public.public_forms enable row level security;
drop trigger if exists public_forms_set_updated_at on public.public_forms;
create trigger public_forms_set_updated_at
  before update on public.public_forms
  for each row execute function public.set_updated_at();

create table if not exists public.form_fields (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.public_forms (id) on delete cascade,
  label       text not null,
  field_key   text not null,
  field_type  text not null
                check (field_type in
                  ('text', 'email', 'phone', 'textarea', 'dropdown',
                   'multi_select', 'checkbox', 'date', 'hidden')),
  required    boolean not null default false,
  options     jsonb not null default '[]'::jsonb,   -- dropdown / multi_select choices
  placeholder text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (form_id, field_key)
);

create index if not exists form_fields_form_idx on public.form_fields (form_id);

alter table public.form_fields enable row level security;

-- ── resources (PRD §30) ───────────────────────────────────────────────
create table if not exists public.resources (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  title             text not null,
  description       text,
  file_path         text not null,                 -- object path in storage 'resources'
  file_name         text not null,                 -- original name for downloads
  mime_type         text,
  file_size         bigint,
  thumbnail_path    text,
  visibility        text not null default 'public' check (visibility in ('public', 'private')),
  published         boolean not null default true,
  gated             boolean not null default false, -- require name/email before download
  download_count    integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists resources_org_idx on public.resources (organization_id);
create index if not exists resources_org_published_idx on public.resources (organization_id, published, visibility);

alter table public.resources enable row level security;
drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

-- One-time unlock tokens for gated downloads (PRD §68: private files never
-- reachable via predictable URLs; the token is the capability).
create table if not exists public.resource_gates (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  token       uuid not null default gen_random_uuid() unique,
  contact_id  uuid references public.contacts (id) on delete set null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

create index if not exists resource_gates_token_idx on public.resource_gates (token);
create index if not exists resource_gates_resource_idx on public.resource_gates (resource_id, used_at);

alter table public.resource_gates enable row level security;

-- Rate-limit + audit trail for public form submissions (PRD §67).
-- Holds only a salted hash of the submitter IP, never the raw address.
create table if not exists public.form_submission_events (
  id         uuid primary key default gen_random_uuid(),
  form_id    uuid not null references public.public_forms (id) on delete cascade,
  ip_hash    text,
  created_at timestamptz not null default now()
);

create index if not exists form_submission_events_window_idx
  on public.form_submission_events (form_id, ip_hash, created_at desc);

alter table public.form_submission_events enable row level security;

-- =====================================================================
-- RLS policies — member reads; owner/admin writes (config surfaces).
-- Internal tables (resource_gates, form_submission_events) intentionally
-- have NO member policies: only the SECURITY DEFINER functions below and
-- the service role can access them.
-- =====================================================================

-- services
drop policy if exists services_select on public.services;
create policy services_select on public.services for select
  using (public.is_org_member(organization_id));
drop policy if exists services_insert on public.services;
create policy services_insert on public.services for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists services_update on public.services;
create policy services_update on public.services for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists services_delete on public.services;
create policy services_delete on public.services for delete
  using (public.is_org_admin(organization_id));

-- public_forms
drop policy if exists public_forms_select on public.public_forms;
create policy public_forms_select on public.public_forms for select
  using (public.is_org_member(organization_id));
drop policy if exists public_forms_insert on public.public_forms;
create policy public_forms_insert on public.public_forms for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists public_forms_update on public.public_forms;
create policy public_forms_update on public.public_forms for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists public_forms_delete on public.public_forms;
create policy public_forms_delete on public.public_forms for delete
  using (public.is_org_admin(organization_id));

-- form_fields — scoped through the linked form
drop policy if exists form_fields_select on public.form_fields;
create policy form_fields_select on public.form_fields for select
  using (
    exists (
      select 1 from public.public_forms f
      where f.id = form_fields.form_id and public.is_org_member(f.organization_id)
    )
  );
drop policy if exists form_fields_insert on public.form_fields;
create policy form_fields_insert on public.form_fields for insert
  with check (
    exists (
      select 1 from public.public_forms f
      where f.id = form_fields.form_id and public.is_org_admin(f.organization_id)
    )
  );
drop policy if exists form_fields_update on public.form_fields;
create policy form_fields_update on public.form_fields for update
  using (
    exists (
      select 1 from public.public_forms f
      where f.id = form_fields.form_id and public.is_org_admin(f.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.public_forms f
      where f.id = form_fields.form_id and public.is_org_admin(f.organization_id)
    )
  );
drop policy if exists form_fields_delete on public.form_fields;
create policy form_fields_delete on public.form_fields for delete
  using (
    exists (
      select 1 from public.public_forms f
      where f.id = form_fields.form_id and public.is_org_admin(f.organization_id)
    )
  );

-- resources
drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources for select
  using (public.is_org_member(organization_id));
drop policy if exists resources_insert on public.resources;
create policy resources_insert on public.resources for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists resources_update on public.resources;
create policy resources_update on public.resources for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists resources_delete on public.resources;
create policy resources_delete on public.resources for delete
  using (public.is_org_admin(organization_id));

-- =====================================================================
-- Public read RPC — the ONLY way anon touches business data (PRD §61/§65).
-- Projects only public-safe columns; unused/private data never leaves.
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
      'primary_color', o.primary_color, 'secondary_color', o.secondary_color
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
-- submit_public_form (PRD §22–23): validate → find/create contact →
-- activity → create/update lead → assign source. Called ONLY from server
-- actions via the service role key. Self-enforcing:
--   * org is always the form's org (never client-supplied),
--   * required fields are checked against the form's own field config,
--   * submissions are rate-limited per IP hash (10/hour/form),
--   * email addresses are syntax-checked.
-- =====================================================================
create or replace function public.submit_public_form(
  p_form_slug text,
  p_ip_hash   text default null,
  p_values    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_id     uuid;
  v_form_name   text;
  v_org_id      uuid;
  v_source      text;
  v_f           record;
  v_value       text;
  v_honeypot    text;
  v_first       text := '';
  v_last        text := '';
  v_email       text := '';
  v_phone       text := '';
  v_msg         text := '';
  v_subject     text;
  v_count       integer;
  v_contact_id  uuid;
  v_lead_id     uuid;
  v_contact_new boolean := false;
  v_lead_new    boolean := false;
begin
  -- Unknown or inactive form -> same response as a rate limit (no oracle)
  select f.id, f.name, f.organization_id, f.source
    into v_form_id, v_form_name, v_org_id, v_source
  from public.public_forms f
  where f.slug = p_form_slug and f.active = true;

  if v_form_id is null then
    raise exception 'FORM_REJECTED';
  end if;

  -- Honeypot: hidden field that real users never fill.
  v_honeypot := coalesce(p_values ->> 'company_website', '');
  if v_honeypot <> '' then
    raise exception 'FORM_REJECTED';
  end if;

  -- Rate limit: 10 submissions per IP hash per form per rolling hour.
  if p_ip_hash is not null then
    select count(*) into v_count
    from public.form_submission_events
    where form_id = v_form_id
      and ip_hash = p_ip_hash
      and created_at > now() - interval '60 minutes';

    if v_count >= 10 then
      raise exception 'FORM_RATE_LIMITED';
    end if;
  end if;

  insert into public.form_submission_events (form_id, ip_hash)
  values (v_form_id, p_ip_hash);

  -- Required-field validation against the form's own config
  for v_f in
    select field_key, field_type from public.form_fields
    where form_id = v_form_id and required = true
    order by sort_order
  loop
    v_value := coalesce(nullif(trim(p_values ->> v_f.field_key), ''), '');
    if v_value = '' then
      raise exception 'FORM_FIELD_REQUIRED: %', v_f.field_key;
    end if;
  end loop;

  -- Normalize identity fields
  v_email := lower(nullif(trim(p_values ->> 'email'), ''));
  if v_email is not null and v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'FORM_INVALID_EMAIL';
  end if;
  v_phone := nullif(trim(p_values ->> 'phone'), '');
  v_msg   := nullif(trim(p_values ->> 'message'), '');

  v_first := nullif(trim(coalesce(p_values ->> 'first_name', '') || ' ' ||
                         coalesce(p_values ->> 'last_name', '')), '');

  if v_first is null or v_first = '' then
    v_first := nullif(trim(p_values ->> 'name'), '');
  end if;
  if v_first is not null then
    v_first := regexp_replace(v_first, '\s+', ' ', 'g');
    v_last  := coalesce(nullif(trim(substring(v_first from ' [^ ]+$')), ''), '');
    v_first := coalesce(nullif(trim(regexp_replace(v_first, ' [^ ]+$', '')), ''), '');
  end if;

  -- Find or create the contact (email first, then phone digits)
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
    v_contact_new := true;
    insert into public.contacts (
      organization_id, first_name, last_name, email, phone, contact_type, source
    )
    values (v_org_id, coalesce(v_first, ''), coalesce(v_last, ''),
            v_email, v_phone, 'Lead', v_source)
    returning id into v_contact_id;
  else
    -- Update the contact so fresh data is captured (PRD §23 "update contact")
    update public.contacts
    set first_name = case when first_name = '' or first_name is null
                          then coalesce(v_first, first_name) else first_name end,
        last_name  = case when last_name = '' or last_name is null
                          then coalesce(v_last, last_name) else last_name end,
        email      = coalesce(v_email, email),
        phone      = coalesce(v_phone, phone)
    where id = v_contact_id;
  end if;

  -- Re-use an open lead, otherwise create one (PRD §23 "create/update lead")
  select id into v_lead_id
  from public.leads
  where contact_id = v_contact_id and stage not in ('Won', 'Lost')
  order by created_at desc
  limit 1;

  if v_lead_id is null then
    v_lead_new := true;
    insert into public.leads (organization_id, contact_id, stage, source)
    values (v_org_id, v_contact_id, 'New', v_source)
    returning id into v_lead_id;
  else
    update public.leads set source = v_source where id = v_lead_id;
  end if;

  -- Activity + quiet audit metadata for M5 notifications
  v_subject := format('Form "%s" submitted', v_form_name);
  perform public.log_activity(
    v_org_id, v_contact_id, v_lead_id, 'form_submitted', v_subject,
    coalesce(v_msg, ''),
    jsonb_build_object(
      'form_slug', p_form_slug, 'form_name', v_form_name,
      'source', v_source
    )
  );

  return jsonb_build_object(
    'ok', true,
    'contact_id', v_contact_id,
    'lead_id', v_lead_id,
    'contact_created', v_contact_new,
    'lead_created', v_lead_new
  );
end;
$$;

-- =====================================================================
-- Gated resources (PRD §31): visitor submits name/email/phone → contact
-- created/updated → activity → one-time download token.
-- =====================================================================
create or replace function public.request_resource_download(
  p_resource_id uuid,
  p_name        text default null,
  p_email       text default null,
  p_phone       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id      uuid;
  v_gated       boolean;
  v_published   boolean;
  v_email       text;
  v_phone       text;
  v_first       text;
  v_last        text;
  v_contact_id  uuid;
  v_lead_id     uuid;
  v_token       uuid;
begin
  select organization_id, gated, published into v_org_id, v_gated, v_published
  from public.resources
  where id = p_resource_id;

  if v_org_id is null or not v_published or v_gated = false then
    raise exception 'RESOURCE_NOT_GATED';
  end if;

  v_email := lower(nullif(trim(p_email), ''));
  v_phone := nullif(trim(p_phone), '');
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'RESOURCE_GATE_EMAIL_REQUIRED';
  end if;

  v_first := nullif(trim(p_name), '');
  if v_first is null or v_first = '' then
    raise exception 'RESOURCE_GATE_NAME_REQUIRED';
  end if;
  v_first := regexp_replace(v_first, '\s+', ' ', 'g');
  v_last  := coalesce(nullif(trim(substring(v_first from ' [^ ]+$')), ''), '');
  v_first := coalesce(nullif(trim(regexp_replace(v_first, ' [^ ]+$', '')), ''), '');

  -- Find or create the contact
  select c.id into v_contact_id
  from public.contacts c
  where c.organization_id = v_org_id
    and (
      lower(c.email) = v_email
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
    values (v_org_id, v_first, coalesce(v_last, ''), v_email, v_phone,
            'Lead', 'Resource download')
    returning id into v_contact_id;
  end if;

  -- Tie to an open lead (or create one) so the inquiry shows up in the pipeline
  select id into v_lead_id
  from public.leads
  where contact_id = v_contact_id and stage not in ('Won', 'Lost')
  order by created_at desc
  limit 1;

  if v_lead_id is null then
    insert into public.leads (organization_id, contact_id, stage, source)
    values (v_org_id, v_contact_id, 'New', 'Resource download')
    returning id into v_lead_id;
  end if;

  perform public.log_activity(
    v_org_id, v_contact_id, v_lead_id, 'resource_gate_filled',
    'Resource requested', 'Gate form submitted for a resource download',
    jsonb_build_object('resource_id', p_resource_id)
  );

  insert into public.resource_gates (resource_id, contact_id)
  values (p_resource_id, v_contact_id)
  returning token into v_token;

  return jsonb_build_object(
    'ok', true, 'token', v_token,
    'contact_id', v_contact_id, 'lead_id', v_lead_id
  );
end;
$$;

-- =====================================================================
-- record_resource_download: validates the gate token (if gated), bumps the
-- download counter and logs the activity. Called by the download route
-- handler with the service role key — never by the anon role.
-- =====================================================================
create or replace function public.record_resource_download(
  p_resource_id uuid,
  p_token       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id      uuid;
  v_gated       boolean;
  v_published   boolean;
  v_title       text;
  v_file_path   text;
  v_file_name   text;
  v_mime_type   text;
  v_file_size   bigint;
  v_contact_id  uuid;
begin
  select organization_id, gated, published, title,
         file_path, file_name, mime_type, file_size
    into v_org_id, v_gated, v_published, v_title,
         v_file_path, v_file_name, v_mime_type, v_file_size
  from public.resources
  where id = p_resource_id;

  if v_org_id is null or not v_published then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_gated then
    select contact_id into v_contact_id
    from public.resource_gates
    where resource_id = p_resource_id
      and token = p_token
      and used_at is null
    limit 1;

    if v_contact_id is null then
      raise exception 'RESOURCE_GATE_REQUIRED';
    end if;

    update public.resource_gates
    set used_at = now()
    where resource_id = p_resource_id and token = p_token;
  end if;

  update public.resources
  set download_count = download_count + 1
  where id = p_resource_id;

  perform public.log_activity(
    v_org_id, v_contact_id, null, 'resource_downloaded',
    'Resource downloaded', v_title,
    jsonb_build_object('resource_id', p_resource_id, 'title', v_title)
  );

  return jsonb_build_object(
    'ok', true,
    'contact_id', v_contact_id,
    'file_path', v_file_path,
    'file_name', v_file_name,
    'mime_type', v_mime_type,
    'file_size', v_file_size
  );
end;
$$;

-- =====================================================================
-- Storage: private 'resources' bucket (PRD §65 — private files are never
-- served via predictable URLs; downloads flow through signed URLs issued
-- server-side after gate validation).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resources',
  'resources',
  false,
  52428800, -- 50 MB
  null
)
on conflict (id) do nothing;

-- Members may read objects (used by the dashboard preview)
drop policy if exists resources_read_member on storage.objects;
create policy resources_read_member
  on storage.objects for select
  using (
    bucket_id = 'resources'
    and exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid()
        and m.organization_id = (regexp_match(name, '^orgs/([^/]+)/'))[1]::uuid
    )
  );

-- Uploads/overwrites/deletes: owner/admin only
drop policy if exists resources_insert_admin on storage.objects;
create policy resources_insert_admin
  on storage.objects for insert
  with check (
    bucket_id = 'resources'
    and exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid()
        and m.organization_id = (regexp_match(name, '^orgs/([^/]+)/'))[1]::uuid
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists resources_update_admin on storage.objects;
create policy resources_update_admin
  on storage.objects for update
  using (
    bucket_id = 'resources'
    and exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid()
        and m.organization_id = (regexp_match(name, '^orgs/([^/]+)/'))[1]::uuid
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists resources_delete_admin on storage.objects;
create policy resources_delete_admin
  on storage.objects for delete
  using (
    bucket_id = 'resources'
    and exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid()
        and m.organization_id = (regexp_match(name, '^orgs/([^/]+)/'))[1]::uuid
        and m.role in ('owner', 'admin')
    )
  );

-- =====================================================================
-- Seed: a ready-to-use "Contact us" form for the first client so the
-- public page has a working lead form out of the box. The business can
-- edit or extend it in /dashboard/forms.
-- =====================================================================
do $$
declare
  v_org  uuid;
  v_form uuid;
begin
  select id into v_org from public.organizations where slug = 'first-client';
  if v_org is null then
    return;
  end if;

  insert into public.public_forms (organization_id, name, slug, description, source)
  values (v_org, 'Contact us', 'contact-us',
          'Tell us a little about what you''re looking for and we''ll get back to you.',
          'Public website')
  on conflict (organization_id, slug) do nothing
  returning id into v_form;

  if v_form is not null then
    insert into public.form_fields (form_id, label, field_key, field_type, required, sort_order, placeholder)
    values
      (v_form, 'Name',    'name',    'text',     true,  1, 'Your name'),
      (v_form, 'Email',   'email',   'email',    true,  2, 'you@example.com'),
      (v_form, 'Phone',   'phone',   'phone',    false, 3, 'Best number to reach you'),
      (v_form, 'Message', 'message', 'textarea', false, 4, 'How can we help?')
    on conflict (form_id, field_key) do nothing;
  end if;
end $$;

-- =====================================================================
-- Grants — anon gets ONLY get_public_page (read-only projection). Every
-- write path goes through the service role via server actions/route
-- handlers. Re-assert table grants for new tables (default privileges from
-- 0001 already cover them) and function executes.
-- =====================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

grant execute on function public.get_public_page(text) to anon, authenticated;
grant execute on function public.submit_public_form(text, text, jsonb) to service_role;
grant execute on function public.request_resource_download(uuid, text, text, text) to service_role;
grant execute on function public.record_resource_download(uuid, uuid) to service_role;