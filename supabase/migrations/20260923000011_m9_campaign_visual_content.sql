-- M9 — Preserve visual template content when a campaign is created.
alter table public.campaigns
  add column if not exists image_url text,
  add column if not exists sections jsonb not null default '[]'::jsonb,
  add column if not exists body_background_color text;
