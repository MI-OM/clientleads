-- M6 follow-up — configurable appointment reminders.
-- Append-only: this follows the integrations migration (00016).

alter table public.automations drop constraint if exists automations_trigger_type_check;
alter table public.automations add constraint automations_trigger_type_check
  check (trigger_type in (
    'appointment_booked', 'form_submitted', 'appointment_completed',
    'resource_downloaded', 'contact_created', 'lead_stage_changed',
    'appointment_cancelled', 'appointment_no_show', 'appointment_reminder'
  ));

-- Prevent duplicate sends if schedulers overlap or retry. Existing workflow
-- actions are unaffected because these indexes apply only to reminder rows.
create unique index if not exists automation_actions_appointment_reminder_once_idx
  on public.automation_actions (appointment_id, md5(step::text))
  where trigger_type = 'appointment_reminder';

-- Every existing organization gets a disabled, opt-in appointment rule.
insert into public.automations (organization_id, trigger_type, name, active, action_config)
select id, 'appointment_reminder', 'Appointment reminder', false,
       '{"steps":[],"conditions":{}}'::jsonb
from public.organizations
on conflict (organization_id, trigger_type) do nothing;
