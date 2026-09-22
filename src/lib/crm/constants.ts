/**
 * CRM domain constants (PRD §10–15). These are UI-level *lists of values*.
 * They are deliberately app constants, not database constraints, so stages,
 * types and sources can later become per-organization configuration
 * (PRD §10 "Contact types should be configurable", §14 "Stages should
 * eventually be configurable") without a migration.
 */

export const CONTACT_TYPES = [
  "Lead",
  "Prospect",
  "Client",
  "Past Client",
  "Referral Partner",
  "Other",
] as const;

export const LEAD_STAGES = [
  "New",
  "Contacted",
  "Qualified",
  "Appointment",
  "Active",
  "Won",
  "Lost",
] as const;

export const LEAD_SOURCES = [
  "Public website",
  "Booking",
  "Lead form",
  "Newsletter",
  "Referral",
  "Manual entry",
  "Import",
  "Other",
] as const;

export const PRIORITIES = ["Low", "Normal", "High"] as const;

/** Contact-level status helper column (PRD §42 lead_status). */
export const CONTACT_LEAD_STATUSES = LEAD_STAGES as readonly string[];

export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "dropdown",
  "multi_select",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Activity types written by the system (triggers) and the app. */
export const ACTIVITY_TYPES = [
  "contact_created",
  "contact_updated",
  "contact_deleted",
  "contact_archived",
  "contact_restored",
  "tag_added",
  "tag_removed",
  "lead_created",
  "lead_updated",
  "lead_stage_changed",
  "lead_deleted",
  "note_added",
] as const;

export interface ActivityMeta {
  label: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  contact_created: "Contact created",
  contact_updated: "Contact updated",
  contact_deleted: "Contact deleted",
  contact_archived: "Contact archived",
  contact_restored: "Contact restored",
  tag_added: "Tag added",
  tag_removed: "Tag removed",
  lead_created: "Lead created",
  lead_updated: "Lead updated",
  lead_stage_changed: "Stage changed",
  lead_deleted: "Lead deleted",
  note_added: "Note",
};

export function activityMeta(type: string): ActivityMeta {
  return { label: ACTIVITY_LABELS[type] ?? type.replace(/_/g, " ") };
}

export const DEFAULT_PAGE_SIZE = 20;
