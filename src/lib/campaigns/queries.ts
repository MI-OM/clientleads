import { createClient } from "@/lib/supabase/server";
import type {
  AudienceSpec,
  Campaign,
  CampaignRecipient,
  CampaignStatus,
  EmailTemplate,
  RecipientStatus,
} from "@/lib/campaigns/types";
import { parseTemplateSections } from "@/lib/campaigns/template-sections";

/* ── row mapping ─────────────────────────────────────────────────────── */

interface EmailTemplateRow {
  id: string;
  organization_id: string;
  name: string;
  subject: string;
  body: string;
  image_url: string | null;
  body_background_color: string | null;
  sections: unknown;
  variables: unknown;
  created_at: string;
  updated_at: string;
}

function mapEmailTemplate(row: EmailTemplateRow): EmailTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    imageUrl: row.image_url ?? null,
    bodyBackgroundColor: row.body_background_color ?? null,
    sections: parseTemplateSections(row.sections),
    variables: Array.isArray(row.variables) ? row.variables.map(String) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface CampaignRow {
  id: string;
  organization_id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  content: string;
  image_url: string | null;
  body_background_color: string | null;
  sections: unknown;
  sender_name: string;
  sender_email: string;
  status: CampaignStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  audience: unknown;
  recipients_count: number;
  delivered_count: number;
  bounced_count: number;
  opened_count: number;
  clicked_count: number;
  unsubscribed_count: number;
  created_at: string;
  updated_at: string;
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    subject: row.subject,
    previewText: row.preview_text,
    content: row.content,
    imageUrl: row.image_url ?? null,
    bodyBackgroundColor: row.body_background_color ?? null,
    sections: parseTemplateSections(row.sections),
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    status: row.status,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    audience: (row.audience as AudienceSpec) ?? { scope: "all" },
    recipientsCount: row.recipients_count,
    deliveredCount: row.delivered_count,
    bouncedCount: row.bounced_count,
    openedCount: row.opened_count,
    clickedCount: row.clicked_count,
    unsubscribedCount: row.unsubscribed_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RecipientRow {
  id: string;
  organization_id: string;
  campaign_id: string;
  contact_id: string;
  status: RecipientStatus;
  token: string;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  contact?: { first_name?: string; last_name?: string; email?: string | null } | null;
}

function mapRecipient(row: RecipientRow): CampaignRecipient {
  const first = row.contact?.first_name ?? "";
  const last = row.contact?.last_name ?? "";
  return {
    id: row.id,
    organizationId: row.organization_id,
    campaignId: row.campaign_id,
    contactId: row.contact_id,
    status: row.status,
    token: row.token,
    providerMessageId: row.provider_message_id,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    openedAt: row.opened_at,
    clickedAt: row.clicked_at,
    bouncedAt: row.bounced_at,
    unsubscribedAt: row.unsubscribed_at,
    createdAt: row.created_at,
    contactName: `${first} ${last}`.trim() || null,
    contactEmail: row.contact?.email ?? null,
  };
}

/* ── templates ───────────────────────────────────────────────────────── */

export async function listEmailTemplates(orgId: string): Promise<EmailTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("organization_id", orgId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapEmailTemplate(row as unknown as EmailTemplateRow));
}

export async function listEmailTemplatesPage(
  orgId: string,
  page = 1,
  pageSize = 12,
): Promise<{ templates: EmailTemplate[]; totalPages: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("email_templates")
    .select("*", { count: "exact" })
    .eq("organization_id", orgId)
    .order("name", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return {
    templates: (data ?? []).map((row) => mapEmailTemplate(row as unknown as EmailTemplateRow)),
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}

export async function getEmailTemplate(orgId: string, id: string): Promise<EmailTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapEmailTemplate(data as unknown as EmailTemplateRow) : null;
}

/* ── campaigns ───────────────────────────────────────────────────────── */

export async function listCampaigns(orgId: string): Promise<Campaign[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapCampaign(row as unknown as CampaignRow));
}

export async function listCampaignsPage(
  orgId: string,
  page = 1,
  pageSize = 12,
): Promise<{ campaigns: Campaign[]; totalPages: number }> {
  const supabase = await createClient();
  const currentPage = Math.max(1, page);
  const from = (currentPage - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("campaigns")
    .select("*", { count: "exact" })
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return {
    campaigns: (data ?? []).map((row) => mapCampaign(row as unknown as CampaignRow)),
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}

export async function getCampaign(orgId: string, id: string): Promise<Campaign | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapCampaign(data as unknown as CampaignRow) : null;
}

/** Recipient rows for one campaign (newest first, capped for the UI). */
export async function listCampaignRecipients(
  orgId: string,
  campaignId: string,
  limit = 500,
): Promise<CampaignRecipient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaign_recipients")
    .select(
      "id, organization_id, campaign_id, contact_id, status, token, provider_message_id, sent_at, delivered_at, opened_at, clicked_at, bounced_at, unsubscribed_at, created_at, contact:contacts(first_name, last_name, email)",
    )
    .eq("organization_id", orgId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => mapRecipient(row as unknown as RecipientRow));
}

/* ── audience descriptions ───────────────────────────────────────────── */

function tagLabel(ids: string[]): string {
  if (ids.length === 0) return "no tags";
  if (ids.length === 1) return "1 tag";
  return `${ids.length} tags (all required)`;
}

/** One-line human description of an audience spec (cards + detail page). */
export function describeAudience(audience: AudienceSpec): string {
  if (!audience || typeof audience !== "object") return "All contacts";
  switch (audience.scope) {
    case "tags":
      return `Contacts with ${tagLabel(audience.tags)}`;
    case "contact_type":
      return `Contacts of type “${audience.contact_type}”`;
    case "custom":
      return `Contacts matching ${audience.custom_fields.length} custom field rule${
        audience.custom_fields.length === 1 ? "" : "s"
      }`;
    default:
      return "All opted-in contacts (excluding unsubscribed)";
  }
}
