"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrg } from "@/lib/auth/org";
import { sendCampaign } from "@/lib/email/campaign";
import type { AudienceSpec, CustomAudienceFilter } from "@/lib/campaigns/types";
import { parseTemplateSections, type TemplateSection } from "@/lib/campaigns/template-sections";
import { isValidTimeZone, localDateTimeToUtc } from "@/lib/timezone";

export interface CampaignActionState {
  error?: string;
  ok?: boolean;
  info?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function canManage(ctx: Awaited<ReturnType<typeof getMyOrg>>): ctx is NonNullable<typeof ctx> {
  return !!ctx && (ctx.role === "owner" || ctx.role === "admin");
}

/**
 * Rebuild the AudienceSpec from the audience builder form (PRD §27).
 * The DB re-validates everything at resolve time; this just shapes input.
 */
function parseAudience(formData: FormData): { audience: AudienceSpec } | { error: string } {
  const scope = String(formData.get("audienceScope") ?? "all").trim();

  if (scope === "" || scope === "all") return { audience: { scope: "all" } };

  if (scope === "tags") {
    const tags = formData
      .getAll("audienceTag")
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (tags.length === 0) return { error: "Pick at least one tag." };
    if (!tags.every((t) => UUID_RE.test(t))) return { error: "Invalid tag selection." };
    return { audience: { scope: "tags", tags } };
  }

  if (scope === "contact_type") {
    const contactType = String(formData.get("audienceContactType") ?? "").trim();
    if (!contactType) return { error: "Pick a contact type." };
    return { audience: { scope: "contact_type", contact_type: contactType } };
  }

  if (scope === "custom") {
    const keys = formData.getAll("customFieldKey").map((v) => String(v).trim());
    const ops = formData.getAll("customOperator").map((v) => String(v).trim());
    const vals = formData.getAll("customValue").map((v) => String(v).trim());
    const custom_fields: CustomAudienceFilter[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      if (!keys[i] && !vals[i]) continue;
      if (!keys[i] || !vals[i]) return { error: "Each custom filter needs a field and a value." };
      const operator = ops[i] ?? "eq";
      if (operator !== "eq" && operator !== "ne" && operator !== "contains") {
        return { error: "Invalid filter operator." };
      }
      custom_fields.push({ field_key: keys[i], operator, value: vals[i] });
    }
    if (custom_fields.length === 0) return { error: "Add at least one custom field filter." };
    return { audience: { scope: "custom", custom_fields } };
  }

  return { error: "Choose a valid audience." };
}

function friendlyDbError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You don't have permission to manage campaigns.";
  }
  return "Something went wrong saving the campaign. Please try again.";
}

function readVisualTemplate(formData: FormData): {
  imageUrl: string | null;
  bodyBackgroundColor: string | null;
  sections: TemplateSection[];
} {
  let sections: TemplateSection[] = [];
  try {
    sections = parseTemplateSections(JSON.parse(String(formData.get("sections") ?? "[]")));
  } catch {
    sections = [];
  }
  return {
    imageUrl: String(formData.get("imageUrl") ?? "").trim() || null,
    bodyBackgroundColor: /^#[0-9a-f]{6}$/i.test(String(formData.get("bodyBackgroundColor") ?? ""))
      ? String(formData.get("bodyBackgroundColor"))
      : null,
    sections,
  };
}

/** Owner/admin-only: create a campaign (PRD §26). */
export async function createCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return { error: "Only owners and administrators can manage campaigns." };

  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const senderEmail = String(formData.get("senderEmail") ?? "").trim();
  if (!name) return { error: "Campaign name is required." };
  if (!subject) return { error: "Email subject is required." };
  if (!EMAIL_RE.test(senderEmail)) return { error: "Enter a valid sender email address." };

  const parsed = parseAudience(formData);
  if ("error" in parsed) return parsed;
  const visual = readVisualTemplate(formData);

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").insert({
    organization_id: ctx.org.id,
    name,
    subject,
    preview_text: String(formData.get("previewText") ?? "").trim() || null,
    content: String(formData.get("content") ?? "").trim(),
    image_url: visual.imageUrl,
    sections: visual.sections,
    body_background_color: visual.bodyBackgroundColor,
    sender_name: String(formData.get("senderName") ?? "ClientLeads").trim() || "ClientLeads",
    sender_email: senderEmail,
    audience: parsed.audience,
  });
  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}

/** Owner/admin-only: update a Draft campaign. */
export async function updateCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return { error: "Only owners and administrators can manage campaigns." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing campaign id." };

  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const senderEmail = String(formData.get("senderEmail") ?? "").trim();
  if (!name) return { error: "Campaign name is required." };
  if (!subject) return { error: "Email subject is required." };
  if (!EMAIL_RE.test(senderEmail)) return { error: "Enter a valid sender email address." };

  const parsed = parseAudience(formData);
  if ("error" in parsed) return parsed;
  const visual = readVisualTemplate(formData);

  const supabase = await createClient();

  // Only Draft campaigns are editable — the state machine owns the rest.
  const { data: existing } = await supabase
    .from("campaigns")
    .select("status")
    .eq("organization_id", ctx.org.id)
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Campaign not found." };
  if (existing.status !== "Draft") {
    return { error: "Only draft campaigns can be edited. Cancel it first to make changes." };
  }

  const { error } = await supabase
    .from("campaigns")
    .update({
      name,
      subject,
      preview_text: String(formData.get("previewText") ?? "").trim() || null,
      content: String(formData.get("content") ?? "").trim(),
      image_url: visual.imageUrl,
      sections: visual.sections,
      body_background_color: visual.bodyBackgroundColor,
      sender_name: String(formData.get("senderName") ?? "ClientLeads").trim() || "ClientLeads",
      sender_email: senderEmail,
      audience: parsed.audience,
    })
    .eq("id", id)
    .eq("organization_id", ctx.org.id);
  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${id}`);
  redirect(`/dashboard/campaigns/${id}`);
}

/** Owner/admin-only: delete a campaign (recipients cascade). */
export async function deleteCampaignAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("campaigns").delete().eq("id", id).eq("organization_id", ctx.org.id);
  revalidatePath("/dashboard/campaigns");
}

/** Owner/admin-only: schedule a Draft campaign (PRD §26). */
export async function scheduleCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return { error: "Only owners and administrators can schedule campaigns." };

  const id = String(formData.get("campaignId") ?? "");
  if (!UUID_RE.test(id)) return { error: "Missing campaign id." };

  const raw = String(formData.get("scheduledFor") ?? "").trim();
  const timeZone = String(formData.get("timeZone") ?? ctx.org.timezone ?? "America/Halifax").trim();
  if (!isValidTimeZone(timeZone)) return { error: "Choose a valid timezone in business settings." };
  const scheduledDate = raw ? localDateTimeToUtc(raw, timeZone) : null;
  if (raw && !scheduledDate) return { error: "That date doesn't look valid." };
  const scheduledFor = scheduledDate?.toISOString() ?? null;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("schedule_campaign", {
    p_campaign_id: id,
    p_scheduled_for: scheduledFor,
  });
  if (error || !data?.ok) {
    return { error: friendlyScheduleError(error?.message ?? String(data ?? "SCHEDULE_FAILED")) };
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${id}`);
  return { ok: true, info: "Campaign scheduled." };
}

/** Owner/admin-only: cancel a campaign (PRD §26). */
export async function cancelCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return { error: "Only owners and administrators can cancel campaigns." };

  const id = String(formData.get("campaignId") ?? "");
  if (!UUID_RE.test(id)) return { error: "Missing campaign id." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cancel_campaign", { p_campaign_id: id });
  if (error || !data?.ok) {
    return { error: friendlyScheduleError(error?.message ?? String(data ?? "CANCEL_FAILED")) };
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${id}`);
  return { ok: true, info: "Campaign cancelled." };
}

/** Owner/admin-only: resolve the audience and fire the Resend loop now. */
export async function sendCampaignNowAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return { error: "Only owners and administrators can send campaigns." };

  const id = String(formData.get("campaignId") ?? "");
  const slug = String(formData.get("slug") ?? "").trim();
  if (!UUID_RE.test(id)) return { error: "Missing campaign id." };

  const admin = createAdminClient();
  const result = await sendCampaign(admin, id, slug);
  if (!result.ok) {
    return { error: friendlyScheduleError(result.error ?? "SEND_FAILED") };
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${id}`);
  return {
    ok: true,
    info: `Sent to ${result.recipientCount} recipients (${result.sentCount} delivered to Resend).`,
  };
}

function friendlyScheduleError(keyOrMessage: string): string {
  switch (keyOrMessage) {
    case "CAMPAIGN_NOT_FOUND":
      return "That campaign no longer exists.";
    case "CAMPAIGN_NOT_SCHEDULABLE":
      return "Only draft campaigns can be scheduled.";
    case "CAMPAIGN_CANNOT_CANCEL":
      return "This campaign is already finished and can't be cancelled.";
    case "CAMPAIGN_NOT_SENDABLE":
      return "Only draft or scheduled campaigns can be sent.";
    case "CAMPAIGN_NOT_SENDING":
      return "This campaign isn't in a sendable state right now.";
    case "CAMPAIGN_AUDIENCE_INVALID":
      return "That audience selection is invalid. Check the filters and try again.";
    default:
      return keyOrMessage || "Something went wrong. Please try again.";
  }
}
