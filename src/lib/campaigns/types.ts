/**
 * M5 Communication/Campaigns domain types (PRD §25–29, §62, §68).
 *
 * These mirror the `email_templates` / `campaigns` / `campaign_recipients`
 * tables from migration 0006 (snake_case rows → camelCase here).
 */

export type CampaignStatus = "Draft" | "Scheduled" | "Sending" | "Sent" | "Cancelled";

export type RecipientStatus =
  | "Queued"
  | "Sent"
  | "Delivered"
  | "Bounced"
  | "Opened"
  | "Clicked"
  | "Unsubscribed"
  | "Suppressed";

/** Audience filter over a contact custom field (validated DB-side). */
export interface CustomAudienceFilter {
  field_key: string;
  operator: "eq" | "ne" | "contains";
  value: string;
}

/**
 * The audience spec stored on a campaign (jsonb). Resolved by
 * `resolve_campaign_recipients` which ALWAYS excludes unsubscribed /
 * opted-out / archived / email-less contacts.
 */
export type AudienceSpec =
  | { scope: "all" }
  | { scope: "tags"; tags: string[] } // AND: contact must carry EVERY tag
  | { scope: "contact_type"; contact_type: string }
  | { scope: "custom"; custom_fields: CustomAudienceFilter[] };

export interface EmailTemplate {
  id: string;
  organizationId: string;
  name: string;
  subject: string;
  body: string;
  imageUrl: string | null;
  bodyBackgroundColor: string | null;
  sections: import("@/lib/campaigns/template-sections").TemplateSection[];
  /** {{vars}} actually referenced by `body` (derived on save). */
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  organizationId: string;
  name: string;
  subject: string;
  previewText: string | null;
  content: string;
  imageUrl: string | null;
  bodyBackgroundColor: string | null;
  sections: import("@/lib/campaigns/template-sections").TemplateSection[];
  senderName: string;
  senderEmail: string;
  status: CampaignStatus;
  scheduledFor: string | null;
  sentAt: string | null;
  audience: AudienceSpec;
  recipientsCount: number;
  deliveredCount: number;
  bouncedCount: number;
  openedCount: number;
  clickedCount: number;
  unsubscribedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecipient {
  id: string;
  organizationId: string;
  campaignId: string;
  contactId: string;
  status: RecipientStatus;
  /** Unsubscribe capability (PRD §68) — never exposed publicly except via the page itself. */
  token: string;
  providerMessageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
  contactName?: string | null;
  contactEmail?: string | null;
}

/** Minimal, leak-free payload from `get_unsubscribe_ctx` (anon). */
export interface UnsubscribeContext {
  orgName: string;
  firstName: string;
  alreadyUnsubscribed: boolean;
}

export type CampaignEvent = "delivered" | "bounced" | "opened" | "clicked" | "unsubscribe";
