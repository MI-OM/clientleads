-- M10 follow-up — ensure background columns exist in already-migrated projects.
alter table public.email_templates
  add column if not exists body_background_color text;

alter table public.campaigns
  add column if not exists body_background_color text;
