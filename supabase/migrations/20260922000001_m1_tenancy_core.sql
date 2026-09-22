-- =====================================================================
-- M1 — Tenancy core: organizations, profiles, organization_members + RLS
-- Applies to the shared Supabase project. Fully IDEMPOTENT: apply once on a
-- fresh project, or re-paste to repair (e.g. after the RLS recursion fix
-- below). Safe to run via the dashboard SQL editor or `supabase db push`.
--
-- PRD §40–41, §61. Every tenant-owned table carries organization_id and
-- RLS is enforced from day one ("no table without policies").
--
-- FIX NOTE (2026-09-22): earlier draft inlined `exists(select … from
-- organization_members)` inside policies on the same table, which Postgres
-- rejects as infinite RLS recursion (code 42P17). Membership checks now go
-- through SECURITY DEFINER helpers (is_org_member / is_org_admin) that
-- bypass RLS, so policies never re-enter themselves.
-- =====================================================================

-- ── Helper: keep updated_at fresh ─────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── organizations (PRD §41) ───────────────────────────────────────────
create table if not exists public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  logo_url        text,
  description     text,
  email           text,
  phone           text,
  address         text,
  city            text,
  province        text,
  country         text,
  postal_code     text,
  timezone        text not null default 'America/Halifax',
  website_url     text,
  social_links    jsonb not null default '{}'::jsonb,
  primary_color   text not null default '#14532d',
  secondary_color text not null default '#f5f5f4',
  -- Single-org bootstrap marker: new signups auto-join this org (M1).
  -- When self-service provisioning arrives (future SaaS phase) this can go.
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists organizations_slug_idx on public.organizations (slug);
create index if not exists organizations_default_idx on public.organizations (is_default);

alter table public.organizations enable row level security;
drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ── profiles (PRD §41: Supabase Auth is the source; mirror from auth.users) ──
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  phone      text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── organization_members (PRD §41) ────────────────────────────────────
create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null default 'staff'
                  check (role in ('owner', 'admin', 'staff')),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_org_idx on public.organization_members (organization_id);
create index if not exists organization_members_user_idx on public.organization_members (user_id);

alter table public.organization_members enable row level security;

-- =====================================================================
-- RLS helper functions (SECURITY DEFINER — bypass RLS, no recursion)
-- General rule (PRD §61): a user may only access records of an org they
-- are an active member of. Roles: owner > admin > staff.
-- =====================================================================

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
  )
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  )
$$;

-- ── RLS policies ──────────────────────────────────────────────────────

-- organizations: members can read; only owner/admin may update
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations for select
  using (public.is_org_member(id));

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin
  on public.organizations for update
  using (public.is_org_admin(id))
  with check (true);

-- profiles: users manage their own row only
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- organization_members: view own memberships or members of orgs you belong to
drop policy if exists members_select_own_or_same_org on public.organization_members;
create policy members_select_own_or_same_org
  on public.organization_members for select
  using (
    user_id = auth.uid()
    or public.is_org_member(organization_id)
  );

-- organization_members: only owner/admin may add/change/remove team members.
-- (M1 has no member-management UI — invitations are future; the policy is
-- the guardrail so a later migration/UI doesn't need schema changes.)
drop policy if exists members_insert_admin on public.organization_members;
create policy members_insert_admin
  on public.organization_members for insert
  with check (public.is_org_admin(organization_id));

drop policy if exists members_update_admin on public.organization_members;
create policy members_update_admin
  on public.organization_members for update
  using (public.is_org_admin(organization_id))
  with check (true);

drop policy if exists members_delete_admin on public.organization_members;
create policy members_delete_admin
  on public.organization_members for delete
  using (public.is_org_admin(organization_id));

-- =====================================================================
-- Signup wiring (single-org bootstrap, PRD §5/§39 "auto-add registering
-- users to the org"). Runs as SECURITY DEFINER so it bypasses RLS.
-- =====================================================================

create or replace function public.auto_join_organization(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_members (organization_id, user_id, role)
  select id, p_user_id, 'staff'
  from public.organizations
  where is_default = true
  on conflict (organization_id, user_id) do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  perform public.auto_join_organization(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Seed the first client org (single deployment model). Rename/replace the
-- placeholder before go-live; the real-estate config (tags, custom fields,
-- services) is seeded per-client in later milestones.
-- =====================================================================
insert into public.organizations (name, slug, is_default)
values ('First Client Real Estate', 'first-client', true)
on conflict (slug) do nothing;

-- =====================================================================
-- Grants. RLS is the enforcement layer; grants open the door.
--  * service_role: full access (server-side flows, tests, migration tooling)
--  * authenticated: full DML on all tables — row access strictly via RLS
--  * anon: nothing yet (public projections arrive with the public pages, M3)
-- Default privileges keep this true for tables created by later migrations.
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;