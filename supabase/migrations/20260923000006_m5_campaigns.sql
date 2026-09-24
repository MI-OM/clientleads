-- =====================================================================
-- M5 — Communication / Campaigns: email templates, campaigns, recipients,
--       audience resolution + delivery state machine + unsubscribe (PRD
--       §25–29, §62, §68).
--
-- Design principles (mirrors M3/M4):
--   * New tables carry organization_id and RLS member-read /
--     owner+admin-write policies exactly like the booking milestone.
--   * anon gets ZERO table grants. Every status transition (schedule /
--     cancel / send / webhook event) is a SECURITY DEFINER RPC called
--     from Next server actions / the webhook route with the service role
--     key. The only anon-reachable campaign surface is the unsubscribe
--     read RPC (get_unsubscribe_ctx) which returns just that one
--     recipient's own minimal fields — never other data.
--   * Audience resolution ALWAYS excludes contacts with `unsubscribed_at`
--     set (and opted-out / archived / email-less contacts) — PRD §29
--     "The application should not send marketing emails to contacts who
--     have opted out."
--   * Unsubscribe tokens are random uuids (PRD §68), non-enumerable,
--     unique per recipient like booking tokens.
--   * The actual Resend API calls happen Next-side; the service key never
--     runs fetch. Everything still works as a logged no-op without
--     RESEND_API_KEY (recipients marked Sent) so the smoke passes without
--     a key.
--
-- Fully idempotent — safe to re-paste. append-only, no destructive DDL.
-- =====================================================================

-- =====================================================================
-- email_templates (PRD §25) — org-scoped reusable templates.
-- `variables` documents which {{vars}} the template body references
-- (derived from the body by the app on save).
-- =====================================================================
create table if not exists public.email_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  subject         text not null,
  body            text not null,
  variables       jsonb not null default '[]'::jsonb, -- e.g. ["first_name","unsubscribe_url"]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists email_templates_org_name_lower_idx
  on public.email_templates (organization_id, lower(name));
create index if not exists email_templates_org_idx on public.email_templates (organization_id);

alter table public.email_templates enable row level security;
drop trigger if exists email_templates_set_updated_at on public.email_templates;
create trigger email_templates_set_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();

-- =====================================================================
-- campaigns (PRD §26) — reusable communication objects.
-- audience is a jsonb filter spec:
--   {"scope":"all"}
--   {"scope":"tags","tags":["<tag-id>", ...]}            -- AND: has ALL tags
--   {"scope":"contact_type","contact_type":"Past Client"}
--   {"scope":"custom","custom_fields":[
--       {"field_key":"preferred_area","operator":"eq","value":"Halifax"}]}
-- counters reflect sends/engagement tracked via webhooks (PRD §28).
-- =====================================================================
create table if not exists public.campaigns (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  name               text not null,
  subject            text not null,
  preview_text       text,
  content            text not null,                 -- body, plain text w/ {{vars}}
  sender_name        text not null default 'ClientLeads',
  sender_email       text not null,
  status             text not null default 'Draft'
                       check (status in ('Draft', 'Scheduled', 'Sending', 'Sent', 'Cancelled')),
  scheduled_for      timestamptz,
  sent_at            timestamptz,
  audience           jsonb not null default '{"scope":"all"}'::jsonb,
  recipients_count   integer not null default 0,
  delivered_count    integer not null default 0,
  bounced_count      integer not null default 0,
  opened_count       integer not null default 0,
  clicked_count      integer not null default 0,
  unsubscribed_count integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists campaigns_org_idx on public.campaigns (organization_id);
create index if not exists campaigns_org_status_idx on public.campaigns (organization_id, status);

alter table public.campaigns enable row level security;
drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- =====================================================================
-- campaign_recipients (PRD §28–29) — per-contact delivery state.
-- status ladder: Queued → Sent → Delivered → Opened → Clicked
-- (Bounced / Unsubscribed / Suppressed are terminal). `token` is the
-- unsubscribe capability (PRD §68); `provider_message_id` ties Resend
-- webhook events (data.email_id) back to a recipient — populated by the
-- send loop from the Resend API response when a key is set.
-- =====================================================================
create table if not exists public.campaign_recipients (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  campaign_id         uuid not null references public.campaigns (id) on delete cascade,
  contact_id          uuid not null references public.contacts (id) on delete cascade,
  status              text not null default 'Queued'
                        check (status in ('Queued', 'Sent', 'Delivered', 'Bounced',
                                          'Opened', 'Clicked', 'Unsubscribed', 'Suppressed')),
  token               uuid not null default gen_random_uuid() unique,
  provider_message_id text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  bounced_at          timestamptz,
  unsubscribed_at     timestamptz,
  created_at          timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists campaign_recipients_campaign_idx on public.campaign_recipients (campaign_id);
create index if not exists campaign_recipients_contact_idx on public.campaign_recipients (contact_id);
create index if not exists campaign_recipients_token_idx on public.campaign_recipients (token);
create index if not exists campaign_recipients_provider_idx on public.campaign_recipients (provider_message_id);

alter table public.campaign_recipients enable row level security;

-- =====================================================================
-- Compliance: `contacts.unsubscribed_at` is the canonical suppression
-- source (PRD §29). M2 shipped the column; re-assert idempotently so a
-- fresh M5-only paste still works.
-- =====================================================================
alter table public.contacts add column if not exists unsubscribed_at timestamptz;

-- =====================================================================
-- RLS policies — member reads; owner/admin writes (the established
-- canonical pattern from 0005, applied to all three new tables).
-- =====================================================================

-- email_templates
drop policy if exists email_templates_select on public.email_templates;
create policy email_templates_select on public.email_templates for select
  using (public.is_org_member(organization_id));
drop policy if exists email_templates_insert on public.email_templates;
create policy email_templates_insert on public.email_templates for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists email_templates_update on public.email_templates;
create policy email_templates_update on public.email_templates for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists email_templates_delete on public.email_templates;
create policy email_templates_delete on public.email_templates for delete
  using (public.is_org_admin(organization_id));

-- campaigns
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select
  using (public.is_org_member(organization_id));
drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns for insert
  with check (public.is_org_admin(organization_id));
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns for delete
  using (public.is_org_admin(organization_id));

-- campaign_recipients — scoped through the campaign (member read only;
-- all writes flow through the service-role RPCs / webhooks below)
drop policy if exists campaign_recipients_select on public.campaign_recipients;
create policy campaign_recipients_select on public.campaign_recipients for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id
        and public.is_org_member(c.organization_id)
    )
  );
drop policy if exists campaign_recipients_insert on public.campaign_recipients;
create policy campaign_recipients_insert on public.campaign_recipients for insert
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id
        and public.is_org_admin(c.organization_id)
    )
  );
drop policy if exists campaign_recipients_update on public.campaign_recipients;
create policy campaign_recipients_update on public.campaign_recipients for update
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id
        and public.is_org_admin(c.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id
        and public.is_org_admin(c.organization_id)
    )
  );
drop policy if exists campaign_recipients_delete on public.campaign_recipients;
create policy campaign_recipients_delete on public.campaign_recipients for delete
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_recipients.campaign_id
        and public.is_org_admin(c.organization_id)
    )
  );

-- =====================================================================
-- schedule_campaign / cancel_campaign — campaign status state machine
-- (PRD §26: Draft → Scheduled → Sending → Sent/Cancelled). Service-role
-- only; the DB is the single source of truth for transitions.
-- =====================================================================
create or replace function public.schedule_campaign(
  p_campaign_id    uuid,
  p_scheduled_for  timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_campaign_id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  select status into v_status from public.campaigns where id = p_campaign_id limit 1;
  if v_status is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;
  if v_status <> 'Draft' then
    raise exception 'CAMPAIGN_NOT_SCHEDULABLE';
  end if;

  update public.campaigns
  set status = 'Scheduled', scheduled_for = p_scheduled_for, updated_at = now()
  where id = p_campaign_id;

  return jsonb_build_object(
    'ok', true, 'campaign_id', p_campaign_id,
    'status', 'Scheduled', 'scheduled_for', p_scheduled_for
  );
end;
$$;

create or replace function public.cancel_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_campaign_id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  select status into v_status from public.campaigns where id = p_campaign_id limit 1;
  if v_status is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;
  if v_status in ('Sent', 'Cancelled') then
    raise exception 'CAMPAIGN_CANNOT_CANCEL';
  end if;

  update public.campaigns
  set status = 'Cancelled', sent_at = null, updated_at = now()
  where id = p_campaign_id;

  return jsonb_build_object('ok', true, 'campaign_id', p_campaign_id, 'status', 'Cancelled');
end;
$$;

-- =====================================================================
-- resolve_campaign_recipients — audience resolution (PRD §27, §29).
-- Derives the org from the campaign row (never client input), builds a
-- guarded dynamic query over contacts:
--   * base exclusions: archived, no email, unsubscribed_at set, or
--     marketing consent off (marketing_opt_in = false)
--   * tags scope  → contact must carry EVERY tag (AND semantics)
--   * contact_type scope → exact type match
--   * custom scope → each spec must match an ACTIVE custom field of the
--     org (field keys are validated against the table before they are
--     interpolated into the query — no injection surface; values are
--     parameter-quoted by Postgres literals)
-- Re-resolving replaces the prior recipient set. Flips the campaign to
-- 'Sending' so only one resolution/round of sends can be in flight.
-- =====================================================================
create or replace function public.resolve_campaign_recipients(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign   record;
  v_org        uuid;
  v_audience   jsonb;
  v_scope      text;
  v_sql        text;
  v_contact_id uuid;
  v_count      integer := 0;
  v_tags       jsonb;
  v_tags_len   integer;
  v_i          integer;
  v_tag        text;
  v_cf         jsonb;
  v_cf_len     integer;
  v_spec       jsonb;
  v_field_key  text;
  v_op         text;
  v_value      text;
  v_cf_id      uuid;
  v_cond       text;
begin
  if p_campaign_id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id limit 1;
  if v_campaign.id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;
  if v_campaign.status not in ('Draft', 'Scheduled') then
    raise exception 'CAMPAIGN_NOT_SENDABLE';
  end if;

  v_org      := v_campaign.organization_id;
  v_audience := coalesce(v_campaign.audience, '{"scope":"all"}'::jsonb);
  v_scope    := lower(coalesce(v_audience ->> 'scope', 'all'));

  -- Re-resolution: replace any previously resolved recipients.
  delete from public.campaign_recipients where campaign_id = p_campaign_id;

  v_sql := 'select c.id from public.contacts c'
        || ' where c.organization_id = ' || quote_literal(v_org)
        || ' and c.archived_at is null'
        || ' and c.email is not null and btrim(c.email) <> ' || quote_literal('')
        || ' and c.unsubscribed_at is null'
        || ' and c.marketing_opt_in = true';

  if v_scope = 'tags' then
    v_tags := v_audience -> 'tags';
    if jsonb_typeof(v_tags) <> 'array' or jsonb_array_length(v_tags) = 0 then
      raise exception 'CAMPAIGN_AUDIENCE_INVALID';
    end if;
    v_tags_len := jsonb_array_length(v_tags);
    -- AND semantics: every listed tag must be on the contact
    for v_i in 0 .. v_tags_len - 1 loop
      v_tag := btrim(v_tags ->> v_i);
      if v_tag !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'CAMPAIGN_AUDIENCE_INVALID';
      end if;
      v_sql := v_sql || format(
        ' and exists (select 1 from public.contact_tags ct'
        || ' where ct.contact_id = c.id and ct.tag_id = %L)', v_tag);
    end loop;
  elsif v_scope = 'contact_type' then
    if nullif(btrim(coalesce(v_audience ->> 'contact_type', '')), '') is null then
      raise exception 'CAMPAIGN_AUDIENCE_INVALID';
    end if;
    v_sql := v_sql || format(' and c.contact_type = %L', btrim(v_audience ->> 'contact_type'));
  elsif v_scope = 'custom' then
    v_cf := v_audience -> 'custom_fields';
    if jsonb_typeof(v_cf) <> 'array' or jsonb_array_length(v_cf) = 0 then
      raise exception 'CAMPAIGN_AUDIENCE_INVALID';
    end if;
    v_cf_len := jsonb_array_length(v_cf);
    for v_i in 0 .. v_cf_len - 1 loop
      v_spec      := v_cf -> v_i;
      v_field_key := lower(btrim(coalesce(v_spec ->> 'field_key', '')));
      v_op        := lower(btrim(coalesce(v_spec ->> 'operator', 'eq')));
      v_value     := coalesce(v_spec ->> 'value', '');
      if v_field_key = '' or v_op not in ('eq', 'ne', 'contains') or btrim(v_value) = '' then
        raise exception 'CAMPAIGN_AUDIENCE_INVALID';
      end if;
      -- the field must exist and be active for this org — this also guards
      -- the column-ish key from ever reaching the query text below
      select id into v_cf_id
      from public.custom_fields
      where organization_id = v_org and entity_type = 'contact'
        and field_key = v_field_key and is_active = true
      limit 1;
      if v_cf_id is null then
        raise exception 'CAMPAIGN_AUDIENCE_UNKNOWN_FIELD: %', v_field_key;
      end if;

      if v_op = 'ne' then
        v_cond := format(
          '(ccv.value is not null and jsonb_typeof(ccv.value) <> ''array'''
          || ' and upper(coalesce(ccv.value #>> ''{}'', '''')) <> upper(%L))', v_value);
      elsif v_op = 'contains' then
        v_cond := format(
          '((jsonb_typeof(ccv.value) = ''array'' and ccv.value @> to_jsonb(%L::text))'
          || ' or strpos(upper(coalesce(ccv.value #>> ''{}'', '''')), upper(%L)) > 0)',
          v_value, v_value);
      else -- eq
        v_cond := format(
          '((jsonb_typeof(ccv.value) = ''array'' and ccv.value @> to_jsonb(%L::text))'
          || ' or upper(coalesce(ccv.value #>> ''{}'', '''')) = upper(%L))',
          v_value, v_value);
      end if;

      v_sql := v_sql || format(
        ' and exists (select 1 from public.contact_custom_values ccv'
        || ' where ccv.contact_id = c.id and ccv.custom_field_id = %L and %s)',
        v_cf_id, v_cond);
    end loop;
  elsif v_scope <> 'all' then
    raise exception 'CAMPAIGN_AUDIENCE_INVALID';
  end if;

  v_sql := v_sql || ' order by c.id';

  for v_contact_id in execute v_sql loop
    insert into public.campaign_recipients (campaign_id, contact_id, organization_id, status)
    values (p_campaign_id, v_contact_id, v_org, 'Queued')
    on conflict (campaign_id, contact_id) do nothing;
    v_count := v_count + 1;
  end loop;

  update public.campaigns
  set recipients_count = v_count, status = 'Sending', updated_at = now()
  where id = p_campaign_id;

  return jsonb_build_object(
    'ok', true, 'campaign_id', p_campaign_id, 'recipient_count', v_count
  );
end;
$$;

-- =====================================================================
-- mark_campaign_recipients_sent — called after the Next-side Resend loop.
-- Marks every still-Queued recipient as Sent (the no-key flow marks them
-- all, so the smoke passes without RESEND_API_KEY) and records the
-- per-recipient provider message ids returned by the Resend API so
-- webhook events (data.email_id) can be correlated. Flips the campaign
-- to Sent.
-- =====================================================================
create or replace function public.mark_campaign_recipients_sent(
  p_campaign_id  uuid,
  p_provider_ids jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_kv     record;
begin
  if p_campaign_id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  select status into v_status from public.campaigns where id = p_campaign_id limit 1;
  if v_status is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;
  if v_status <> 'Sending' then
    raise exception 'CAMPAIGN_NOT_SENDING';
  end if;

  update public.campaign_recipients
  set status = 'Sent', sent_at = now()
  where campaign_id = p_campaign_id and status = 'Queued';

  for v_kv in select * from jsonb_each_text(coalesce(p_provider_ids, '{}'::jsonb)) loop
    if v_kv.key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and btrim(coalesce(v_kv.value, '')) <> '' then
      update public.campaign_recipients
      set provider_message_id = btrim(v_kv.value)
      where id = v_kv.key::uuid and campaign_id = p_campaign_id;
    end if;
  end loop;

  update public.campaigns
  set status = 'Sent', sent_at = now(), updated_at = now()
  where id = p_campaign_id;

  return jsonb_build_object('ok', true, 'campaign_id', p_campaign_id, 'status', 'Sent');
end;
$$;

-- =====================================================================
-- process_campaign_event — webhook RPC (PRD §28). Handles delivered /
-- bounced / opened / clicked / unsubscribe (accepts with or without the
-- `email.` prefix). Idempotent: status changes are monotonic and the
-- campaign counters are RE-COMPUTED from the recipient rows after every
-- event, so a webhook retry never double counts. Unsubscribe also sets
-- the contact's suppression state (PRD §29).
-- =====================================================================
create or replace function public.process_campaign_event(
  p_campaign_id  uuid,
  p_recipient_id uuid,
  p_event        text,
  p_occurred_at  timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event  text;
  v_occur  timestamptz;
  v_rec    record;
  v_status text;
begin
  v_event := lower(btrim(p_event));
  if left(v_event, 6) = 'email.' then
    v_event := substr(v_event, 7);
  end if;
  if v_event = 'unsubscribed' then
    v_event := 'unsubscribe';
  end if;
  if v_event not in ('delivered', 'bounced', 'opened', 'clicked', 'unsubscribe') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_event');
  end if;
  v_occur := coalesce(p_occurred_at, now());

  select r.* into v_rec
  from public.campaign_recipients r
  where r.id = p_recipient_id and r.campaign_id = p_campaign_id
  limit 1;
  if v_rec.id is null then
    return jsonb_build_object('ok', false, 'reason', 'recipient_not_found');
  end if;

  v_status := v_rec.status;
  if v_event = 'bounced' then
    v_status := 'Bounced';
  elsif v_event = 'unsubscribe' then
    v_status := 'Unsubscribed';
  elsif v_status not in ('Bounced', 'Unsubscribed') then
    if v_event = 'opened' then
      v_status := 'Opened';
    elsif v_event = 'clicked' then
      v_status := 'Clicked';
    elsif v_event = 'delivered' and v_status in ('Queued', 'Sent') then
      v_status := 'Delivered';
    end if;
  end if;

  update public.campaign_recipients
  set status          = v_status,
      delivered_at    = case when v_event = 'delivered' and delivered_at is null then v_occur else delivered_at end,
      opened_at       = case when v_event = 'opened' and opened_at is null then v_occur else opened_at end,
      clicked_at      = case when v_event = 'clicked' and clicked_at is null then v_occur else clicked_at end,
      bounced_at      = case when v_event = 'bounced' and bounced_at is null then v_occur else bounced_at end,
      unsubscribed_at = case when v_event = 'unsubscribe' and unsubscribed_at is null then v_occur else unsubscribed_at end
  where id = v_rec.id;

  if v_event = 'unsubscribe' then
    update public.contacts
    set unsubscribed_at = coalesce(unsubscribed_at, v_occur),
        marketing_opt_in = false
    where id = v_rec.contact_id;
  end if;

  -- recompute counters from the recipient rows (idempotent under retries)
  update public.campaigns
  set delivered_count    = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = p_campaign_id and r.status in ('Delivered', 'Opened', 'Clicked')),
      bounced_count      = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = p_campaign_id and r.status = 'Bounced'),
      opened_count       = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = p_campaign_id and r.status in ('Opened', 'Clicked')),
      clicked_count      = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = p_campaign_id and r.status = 'Clicked'),
      unsubscribed_count = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = p_campaign_id and r.status = 'Unsubscribed'),
      updated_at         = now()
  where id = p_campaign_id;

  return jsonb_build_object(
    'ok', true, 'recipient_id', v_rec.id, 'campaign_id', p_campaign_id,
    'status', v_status, 'event', v_event
  );
end;
$$;

-- =====================================================================
-- get_unsubscribe_ctx — the ONLY anon-reachable campaigns surface (read).
-- The unsubscribe page calls it with the recipient's uuid token (PRD §68);
-- it returns only that one recipient's own minimal fields + the business
-- name — no other contact or campaign data ever leaves.
-- =====================================================================
create or replace function public.get_unsubscribe_ctx(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_rec   record;
  v_done  boolean;
begin
  if p_token is null then
    return null;
  end if;

  select r.id, r.contact_id, c.first_name, c.unsubscribed_at is not null as already_unsubscribed,
         o.name as org_name
    into v_rec
  from public.campaign_recipients r
  join public.contacts c on c.id = r.contact_id
  join public.organizations o on o.id = r.organization_id
  where r.token = p_token
  limit 1;

  if v_rec.id is null then
    return null;
  end if;
  v_done := v_rec.already_unsubscribed;

  return jsonb_build_object(
    'ok', true,
    'org_name', v_rec.org_name,
    'first_name', v_rec.first_name,
    'already_unsubscribed', v_done
  );
end;
$$;

-- =====================================================================
-- unsubscribe_contact — public unsubscribe confirmation (PRD §29). The
-- token is the capability; the org is derived from the recipient row.
-- Sets contacts.unsubscribed_at + marketing_opt_in=false and marks the
-- recipient Unsubscribed with counter recompute. Service-role only (called
-- from the unsubscribe page's server action).
-- =====================================================================
create or replace function public.unsubscribe_contact(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  if p_token is null then
    raise exception 'UNSUBSCRIBE_NOT_FOUND';
  end if;

  select r.id, r.contact_id, r.campaign_id into v_rec
  from public.campaign_recipients r
  where r.token = p_token
  limit 1;

  if v_rec.id is null then
    raise exception 'UNSUBSCRIBE_NOT_FOUND';
  end if;

  update public.contacts
  set unsubscribed_at = coalesce(unsubscribed_at, now()),
      marketing_opt_in = false
  where id = v_rec.contact_id;

  update public.campaign_recipients
  set status = 'Unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
  where id = v_rec.id;

  -- recompute the counters for the affected campaign
  update public.campaigns
  set delivered_count    = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = v_rec.campaign_id and r.status in ('Delivered', 'Opened', 'Clicked')),
      bounced_count      = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = v_rec.campaign_id and r.status = 'Bounced'),
      opened_count       = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = v_rec.campaign_id and r.status in ('Opened', 'Clicked')),
      clicked_count      = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = v_rec.campaign_id and r.status = 'Clicked'),
      unsubscribed_count = (select count(*) from public.campaign_recipients r
                            where r.campaign_id = v_rec.campaign_id and r.status = 'Unsubscribed'),
      updated_at         = now()
  where id = v_rec.campaign_id;

  return jsonb_build_object(
    'ok', true, 'contact_id', v_rec.contact_id,
    'campaign_id', v_rec.campaign_id, 'status', 'Unsubscribed'
  );
end;
$$;

-- =====================================================================
-- Grants — anon gets ONLY get_unsubscribe_ctx (leak-free read). Every
-- write path is a SECURITY DEFINER RPC callable with the service role
-- key from server actions / the webhook route. Re-assert table grants for
-- the new tables (default privileges from 0001 already cover them) and
-- function executes.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default — that
-- would let anon call the status/write RPCs directly, so revoke it
-- everywhere and re-grant only the intended roles (idempotent; closes the
-- same pre-existing hole pattern for these too).
-- =====================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

revoke execute on function public.schedule_campaign(uuid, timestamptz) from public;
revoke execute on function public.cancel_campaign(uuid) from public;
revoke execute on function public.resolve_campaign_recipients(uuid) from public;
revoke execute on function public.mark_campaign_recipients_sent(uuid, jsonb) from public;
revoke execute on function public.process_campaign_event(uuid, uuid, text, timestamptz) from public;
revoke execute on function public.get_unsubscribe_ctx(uuid) from public;
revoke execute on function public.unsubscribe_contact(uuid) from public;

grant execute on function public.schedule_campaign(uuid, timestamptz) to service_role;
grant execute on function public.cancel_campaign(uuid) to service_role;
grant execute on function public.resolve_campaign_recipients(uuid) to service_role;
grant execute on function public.mark_campaign_recipients_sent(uuid, jsonb) to service_role;
grant execute on function public.process_campaign_event(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.get_unsubscribe_ctx(uuid) to anon, authenticated;
grant execute on function public.unsubscribe_contact(uuid) to service_role;

-- =====================================================================
-- Seed — initial templates (PRD §25) for the first-client demo org:
-- welcome, confirmation, reminder, cancellation, reschedule, follow-up,
-- newsletter, thank you, lead response. Idempotent (name is unique per
-- org). Variables are documented in the template body + `variables` jsonb.
-- =====================================================================
do $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'first-client';
  if v_org is null then
    return;
  end if;

  insert into public.email_templates (organization_id, name, subject, body, variables)
  select v_org, t.name, t.subject, t.body, t.variables
  from (values
    ('Welcome', 'Welcome to {{business_name}}!',
     'Hi {{first_name}},\n\nWelcome to {{business_name}}! We''re glad you''re here.\n\nStay tuned for news, tips, and offers.\n\nTo stop receiving these emails, click here: {{unsubscribe_url}}',
     '["first_name","business_name","unsubscribe_url"]'::jsonb),
    ('Appointment confirmation', 'Your {{service_name}} is confirmed',
     'Hi {{first_name}},\n\nYour {{service_name}} with {{business_name}} is confirmed for {{appointment_date}} at {{appointment_time}}.\n\nNeed to change it? {{booking_link}}\n\nTo stop receiving these emails, click here: {{unsubscribe_url}}',
     '["first_name","business_name","service_name","appointment_date","appointment_time","booking_link","unsubscribe_url"]'::jsonb),
    ('Appointment reminder', 'Reminder: {{service_name}} on {{appointment_date}}',
     'Hi {{first_name}},\n\nJust a reminder about your {{service_name}} with {{business_name}} on {{appointment_date}} at {{appointment_time}}.\n\nManage your booking here: {{booking_link}}\n\nTo stop receiving these emails, click here: {{unsubscribe_url}}',
     '["first_name","business_name","service_name","appointment_date","appointment_time","booking_link","unsubscribe_url"]'::jsonb),
    ('Appointment cancellation', 'Your {{service_name}} has been cancelled',
     'Hi {{first_name}},\n\nYour {{service_name}} with {{business_name}} on {{appointment_date}} at {{appointment_time}} has been cancelled as requested.\n\nBook another time any time. To stop receiving these emails, click here: {{unsubscribe_url}}',
     '["first_name","business_name","service_name","appointment_date","appointment_time","unsubscribe_url"]'::jsonb),
    ('Appointment reschedule', 'Your {{service_name}} has been rescheduled',
     'Hi {{first_name}},\n\nYour {{service_name}} with {{business_name}} has been rescheduled to {{appointment_date}} at {{appointment_time}}.\n\nManage your booking here: {{booking_link}}\n\nTo stop receiving these emails, click here: {{unsubscribe_url}}',
     '["first_name","business_name","service_name","appointment_date","appointment_time","booking_link","unsubscribe_url"]'::jsonb),
    ('Follow-up', 'Following up from {{business_name}}',
     'Hi {{first_name}},\n\nWe wanted to follow up and see how things are going. If there''s anything {{business_name}} can help with, just reply to this email.\n\nTo stop receiving these emails, click here: {{unsubscribe_url}}',
     '["first_name","business_name","unsubscribe_url"]'::jsonb),
    ('Newsletter', 'News from {{business_name}}',
     'Hi {{first_name}},\n\nHere''s what''s new at {{business_name}} this month.\n\nWe''d love to hear from you!\n\nTo stop receiving these emails, click here: {{unsubscribe_url}}',
     '["first_name","business_name","unsubscribe_url"]'::jsonb),
    ('Thank you', 'Thanks from {{business_name}}',
     'Hi {{first_name}},\n\nThank you for choosing {{business_name}}. We truly appreciate your trust.\n\nTo stop receiving these emails, click here: {{unsubscribe_url}}',
     '["first_name","business_name","unsubscribe_url"]'::jsonb),
    ('Lead response', 'Thanks — we got your message',
     'Hi {{first_name}},\n\nThanks for reaching out to {{business_name}}. Someone will get back to you shortly.\n\nTo stop receiving these emails, click here: {{unsubscribe_url}}',
     '["first_name","business_name","unsubscribe_url"]'::jsonb)
  ) as t(name, subject, body, variables)
  on conflict (organization_id, lower(name)) do nothing;
end $$;