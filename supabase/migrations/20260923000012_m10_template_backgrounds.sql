-- M10 — Optional newsletter and section background colors.
alter table public.email_templates
  add column if not exists body_background_color text;
