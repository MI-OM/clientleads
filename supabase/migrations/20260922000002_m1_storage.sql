-- =====================================================================
-- M1 — Storage: org-scoped asset bucket + policies (PRD §8, §65)
--
--   Bucket: org-assets (public-read; logos/branding are meant to be
--   public on the business page). Private files (resources, leads
--   attachments) will use a separate private bucket in a later milestone.
--
--   Object path convention: orgs/{organization_id}/{file}
--   → policies derive the owning org from the path and require membership.
--
--   Idempotent — safe to re-run.
-- =====================================================================

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'org-assets',
  'org-assets',
  true,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Public read (logos render on the public page)
drop policy if exists org_assets_read_public on storage.objects;
create policy org_assets_read_public
  on storage.objects for select
  using (bucket_id = 'org-assets');

-- Write requires membership of the org named in the path
drop policy if exists org_assets_insert_member on storage.objects;
create policy org_assets_insert_member
  on storage.objects for insert
  with check (
    bucket_id = 'org-assets'
    and exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid()
        and m.organization_id =
            (regexp_match(name, '^orgs/([^/]+)/'))[1]::uuid
    )
  );

drop policy if exists org_assets_update_member on storage.objects;
create policy org_assets_update_member
  on storage.objects for update
  using (
    bucket_id = 'org-assets'
    and exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid()
        and m.organization_id =
            (regexp_match(name, '^orgs/([^/]+)/'))[1]::uuid
    )
  );

drop policy if exists org_assets_delete_member on storage.objects;
create policy org_assets_delete_member
  on storage.objects for delete
  using (
    bucket_id = 'org-assets'
    and exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid()
        and m.organization_id =
            (regexp_match(name, '^orgs/([^/]+)/'))[1]::uuid
    )
  );