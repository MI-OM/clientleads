/**
 * M5 campaign domain constants (PRD §25–29).
 *
 * TEMPLATE_VARIABLES is the whitelist of {{vars}} the renderer knows how to
 * fill at send time (per-recipient values built in `src/lib/email/campaign.ts`).
 * Unknown vars stay as-authored so template authors see what's missing.
 */
import type { CampaignStatus, RecipientStatus } from "./types";

export const TEMPLATE_VARIABLES = [
  "first_name",
  "last_name",
  "email",
  "business_name",
  "service_name",
  "appointment_date",
  "appointment_time",
  "booking_link",
  "unsubscribe_url",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "Draft",
  "Scheduled",
  "Sending",
  "Sent",
  "Cancelled",
];

export const RECIPIENT_STATUSES: RecipientStatus[] = [
  "Queued",
  "Sent",
  "Delivered",
  "Bounced",
  "Opened",
  "Clicked",
  "Unsubscribed",
  "Suppressed",
];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  Draft: "Draft",
  Scheduled: "Scheduled",
  Sending: "Sending",
  Sent: "Sent",
  Cancelled: "Cancelled",
};

export const RECIPIENT_STATUS_LABELS: Record<RecipientStatus, string> = {
  Queued: "Queued",
  Sent: "Sent",
  Delivered: "Delivered",
  Bounced: "Bounced",
  Opened: "Opened",
  Clicked: "Clicked",
  Unsubscribed: "Unsubscribed",
  Suppressed: "Suppressed",
};

/** Campaigns the user is allowed to edit / re-schedule from the dashboard. */
export const CAMPAIGN_EDITABLE_STATUSES: CampaignStatus[] = ["Draft", "Scheduled"];

export function isEditableStatus(status: CampaignStatus): boolean {
  return CAMPAIGN_EDITABLE_STATUSES.includes(status);
}
