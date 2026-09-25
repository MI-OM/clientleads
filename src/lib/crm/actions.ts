"use server";

import { localDateTimeToUtc } from "@/lib/timezone";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyOrg } from "@/lib/auth/org";
import {
  CONTACT_TYPES,
  CUSTOM_FIELD_TYPES,
  LEAD_SOURCES,
  LEAD_STAGES,
  PRIORITIES,
} from "./constants";
import { parseCsv } from "@/lib/csv";

export interface CrmState {
  error?: string;
  success?: string;
  contactId?: string;
  leadId?: string;
  /** Import summary (see importContactsCsvAction). */
  import?: ImportSummary;
}

/* ── shared helpers ──────────────────────────────────────────────────── */

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value || null;
}

function parseJsonField(formData: FormData, key: string): unknown {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function dbError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You don't have permission to do that.";
  }
  if (/unique/i.test(message)) {
    return "A record with that value already exists.";
  }
  if (/foreign key|violates.*constraint/i.test(message)) {
    return "These contacts are linked to another record and cannot be permanently deleted. Archive them instead.";
  }
  return "Something went wrong. Please try again.";
}

async function log(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  args: {
    contactId?: string | null;
    leadId?: string | null;
    type: string;
    subject?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const params: Record<string, unknown> = {
    p_organization_id: orgId,
    p_activity_type: args.type,
  };
  if (args.contactId) params.p_contact_id = args.contactId;
  if (args.leadId) params.p_lead_id = args.leadId;
  if (args.subject) params.p_subject = args.subject;
  if (args.description) params.p_description = args.description;
  if (args.metadata) params.p_metadata = args.metadata;
  await supabase.rpc("log_activity", params);
}

function validContactType(value: string): boolean {
  return (CONTACT_TYPES as readonly string[]).includes(value);
}
function validLeadStage(value: string): boolean {
  return (LEAD_STAGES as readonly string[]).includes(value);
}
function validSource(value: string): boolean {
  return (LEAD_SOURCES as readonly string[]).includes(value);
}
function validPriority(value: string): boolean {
  return (PRIORITIES as readonly string[]).includes(value);
}

async function readCustomValues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  formData: FormData,
): Promise<
  Array<{ organization_id: string; contact_id: string; custom_field_id: string; value: unknown }>
> {
  const raw = parseJsonField(formData, "customValuesJson");
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];

  const { data } = await supabase
    .from("custom_fields")
    .select("id, field_key")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  const keyToId = new Map((data ?? []).map((f) => [String(f.field_key), String(f.id)]));

  const rows: Array<{
    organization_id: string;
    contact_id: string;
    custom_field_id: string;
    value: unknown;
  }> = [];
  for (const [fieldKey, value] of Object.entries(raw as Record<string, unknown>)) {
    const fieldId = keyToId.get(fieldKey);
    if (!fieldId) continue;
    // Empty values are dropped rather than stored as null.
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    rows.push({ organization_id: orgId, contact_id: "", custom_field_id: fieldId, value });
  }
  return rows;
}

async function setContactTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contactId: string,
  formData: FormData,
) {
  const raw = parseJsonField(formData, "tagsJson");
  const tagIds: string[] = Array.isArray(raw) ? raw.map((t) => String(t)).filter(Boolean) : [];
  if (tagIds.length === 0) return;
  const { error } = await supabase
    .from("contact_tags")
    .insert(tagIds.map((tag_id) => ({ contact_id: contactId, tag_id })));
  if (error) throw new Error(dbError(error.message));
}

/* ── contacts ────────────────────────────────────────────────────────── */

export async function createContactAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };

  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const email = optionalText(formData, "email");
  const contactType = text(formData, "contactType") || "Lead";
  const source = text(formData, "source") || "Manual entry";

  if (!firstName && !lastName) return { error: "Enter at least a first or last name." };
  if (email && !/^\S+@\S+\.\S+$/.test(email))
    return { error: "That email address doesn't look valid." };
  if (!validContactType(contactType)) return { error: "Unknown contact type." };
  if (!validSource(source)) return { error: "Unknown source." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      organization_id: ctx.org.id,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: optionalText(formData, "phone"),
      company: optionalText(formData, "company"),
      address: optionalText(formData, "address"),
      city: optionalText(formData, "city"),
      province: optionalText(formData, "province"),
      country: optionalText(formData, "country"),
      postal_code: optionalText(formData, "postalCode"),
      contact_type: contactType,
      lead_status: text(formData, "leadStatus") || "New",
      source,
      assigned_user_id: optionalText(formData, "assignedUserId"),
      notes: optionalText(formData, "notes"),
      marketing_opt_in: formData.get("marketingOptIn") === "on",
    })
    .select("id")
    .single();
  if (error) {
    return { error: dbError(error.message) };
  }

  const contactId = String(data.id);
  try {
    const customRows = await readCustomValues(supabase, ctx.org.id, formData);
    if (customRows.length > 0) {
      const { error: valuesError } = await supabase.from("contact_custom_values").upsert(
        customRows.map((r) => ({ ...r, contact_id: contactId })),
        { onConflict: "contact_id,custom_field_id" },
      );
      if (valuesError) throw new Error(dbError(valuesError.message));
    }
    await setContactTags(supabase, contactId, formData);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/dashboard/contacts");
  redirect(`/dashboard/contacts/${contactId}`);
}

export async function updateContactAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const id = text(formData, "id");
  if (!id) return { error: "Missing contact." };

  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const email = optionalText(formData, "email");
  const contactType = text(formData, "contactType") || "Lead";
  const source = text(formData, "source") || "Manual entry";

  if (!firstName && !lastName) return { error: "Enter at least a first or last name." };
  if (email && !/^\S+@\S+\.\S+$/.test(email))
    return { error: "That email address doesn't look valid." };
  if (!validContactType(contactType)) return { error: "Unknown contact type." };
  if (!validSource(source)) return { error: "Unknown source." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: optionalText(formData, "phone"),
      company: optionalText(formData, "company"),
      address: optionalText(formData, "address"),
      city: optionalText(formData, "city"),
      province: optionalText(formData, "province"),
      country: optionalText(formData, "country"),
      postal_code: optionalText(formData, "postalCode"),
      contact_type: contactType,
      lead_status: text(formData, "leadStatus") || "New",
      source,
      assigned_user_id: optionalText(formData, "assignedUserId"),
      notes: optionalText(formData, "notes"),
      marketing_opt_in: formData.get("marketingOptIn") === "on",
    })
    .eq("organization_id", ctx.org.id)
    .eq("id", id);
  if (error) return { error: dbError(error.message) };

  try {
    // Replace custom values.
    const { error: delValues } = await supabase
      .from("contact_custom_values")
      .delete()
      .eq("contact_id", id);
    if (delValues) throw new Error(dbError(delValues.message));
    const customRows = await readCustomValues(supabase, ctx.org.id, formData);
    if (customRows.length > 0) {
      const { error: valuesError } = await supabase
        .from("contact_custom_values")
        .insert(customRows.map((r) => ({ ...r, contact_id: id })));
      if (valuesError) throw new Error(dbError(valuesError.message));
    }
    // Replace tags.
    await supabase.from("contact_tags").delete().eq("contact_id", id);
    await setContactTags(supabase, id, formData);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/dashboard/contacts");
  revalidatePath(`/dashboard/contacts/${id}`);
  return { success: "Contact saved.", contactId: id };
}

export async function archiveContactAction(contactId: string) {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ archived_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .eq("id", contactId);
  if (error) return { error: dbError(error.message) };
  await log(supabase, ctx.org.id, {
    contactId,
    type: "contact_archived",
    subject: "Contact archived",
  });
  revalidatePath("/dashboard/contacts");
  revalidatePath(`/dashboard/contacts/${contactId}`);
  return { success: "Contact archived." };
}

export async function restoreContactAction(contactId: string) {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ archived_at: null })
    .eq("organization_id", ctx.org.id)
    .eq("id", contactId);
  if (error) return { error: dbError(error.message) };
  await log(supabase, ctx.org.id, {
    contactId,
    type: "contact_restored",
    subject: "Contact restored",
  });
  revalidatePath("/dashboard/contacts");
  revalidatePath(`/dashboard/contacts/${contactId}`);
  return { success: "Contact restored." };
}

export async function deleteContactAction(contactId: string) {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("organization_id", ctx.org.id)
    .eq("id", contactId);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/dashboard/contacts");
  return { success: "Contact deleted." };
}

export async function bulkArchiveContactsAction(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const contactIds = formData
    .getAll("contactId")
    .map(String)
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (contactIds.length === 0) return { error: "Select at least one contact." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ archived_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .in("id", contactIds);
  if (error) {
    return { error: dbError(error.message) };
  }
  revalidatePath("/dashboard/contacts");
  return {
    success: `${contactIds.length} contact${contactIds.length === 1 ? "" : "s"} archived.`,
  };
}

/* ── tags ────────────────────────────────────────────────────────────── */

export async function createTagAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const name = text(formData, "name");
  if (!name) return { error: "Tag name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("tags").insert({
    organization_id: ctx.org.id,
    name,
    description: optionalText(formData, "description"),
  });
  if (error) {
    if (/unique/i.test(error.message)) return { error: "A tag with that name already exists." };
    return { error: dbError(error.message) };
  }
  revalidatePath("/dashboard/contacts");
  return { success: `Tag "${name}" created.` };
}

export async function deleteTagAction(tagId: string) {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can delete tags." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("tags").delete().eq("id", tagId);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/dashboard/contacts");
  return { success: "Tag deleted." };
}

export async function addTagToContactAction(contactId: string, tagId: string) {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_tags")
    .insert({ contact_id: contactId, tag_id: tagId });
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/dashboard/contacts/${contactId}`);
  return { success: true };
}

export async function removeTagFromContactAction(contactId: string, tagId: string) {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_tags")
    .delete()
    .eq("contact_id", contactId)
    .eq("tag_id", tagId);
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/dashboard/contacts/${contactId}`);
  return { success: true };
}

/* ── custom values (inline edit on contact detail) ───────────────────── */

export async function saveContactCustomValuesAction(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const contactId = text(formData, "contactId");
  if (!contactId) return { error: "Missing contact." };

  const supabase = await createClient();
  try {
    const customRows = await readCustomValues(supabase, ctx.org.id, formData);
    const { error: delError } = await supabase
      .from("contact_custom_values")
      .delete()
      .eq("contact_id", contactId);
    if (delError) throw new Error(dbError(delError.message));
    if (customRows.length > 0) {
      const { error: insertError } = await supabase
        .from("contact_custom_values")
        .insert(customRows.map((r) => ({ ...r, contact_id: contactId })));
      if (insertError) throw new Error(dbError(insertError.message));
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath(`/dashboard/contacts/${contactId}`);
  return { success: "Custom fields saved." };
}

/* ── notes ───────────────────────────────────────────────────────────── */

export async function addNoteAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const note = text(formData, "note");
  if (!note) return { error: "Write a note before saving." };

  const contactId = optionalText(formData, "contactId");
  const leadId = optionalText(formData, "leadId");
  const supabase = await createClient();
  await log(supabase, ctx.org.id, {
    contactId,
    leadId,
    type: "note_added",
    subject: "Note added",
    description: note,
  });

  if (contactId) {
    revalidatePath(`/dashboard/contacts/${contactId}`);
  }
  if (leadId) {
    revalidatePath(`/dashboard/leads/${leadId}`);
  }
  return { success: "Note added." };
}

/* ── leads ───────────────────────────────────────────────────────────── */

export async function createLeadAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };

  const contactId = text(formData, "contactId");
  const stage = text(formData, "stage") || "New";
  const source = text(formData, "source") || "Manual entry";
  const priority = text(formData, "priority") || "Normal";

  if (!contactId) return { error: "Choose the contact this lead belongs to." };
  if (!validLeadStage(stage)) return { error: "Unknown stage." };
  if (!validSource(source)) return { error: "Unknown source." };
  if (!validPriority(priority)) return { error: "Unknown priority." };

  const expectedRaw = text(formData, "expectedValue");
  const expectedValue = expectedRaw === "" ? null : Number(expectedRaw);
  const nextFollowUpRaw = text(formData, "nextFollowUpAt");
  const nextFollowUpAt =
    nextFollowUpRaw === ""
      ? null
      : (localDateTimeToUtc(
          nextFollowUpRaw,
          ctx?.org?.timezone ?? "America/St_Johns",
        )?.toISOString() ?? null);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      organization_id: ctx.org.id,
      contact_id: contactId,
      stage,
      source,
      priority,
      assigned_user_id: optionalText(formData, "assignedUserId"),
      expected_value: expectedValue && !Number.isNaN(expectedValue) ? expectedValue : null,
      next_follow_up_at: nextFollowUpAt,
      notes: optionalText(formData, "notes"),
    })
    .select("id")
    .single();
  if (error) return { error: dbError(error.message) };

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/contacts");
  redirect(`/dashboard/leads/${data.id}`);
}

export async function updateLeadAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const id = text(formData, "id");
  if (!id) return { error: "Missing lead." };

  const contactId = text(formData, "contactId");
  const stage = text(formData, "stage") || "New";
  const source = text(formData, "source") || "Manual entry";
  const priority = text(formData, "priority") || "Normal";

  if (!contactId) return { error: "Choose the contact this lead belongs to." };
  if (!validLeadStage(stage)) return { error: "Unknown stage." };
  if (!validSource(source)) return { error: "Unknown source." };
  if (!validPriority(priority)) return { error: "Unknown priority." };

  const expectedRaw = text(formData, "expectedValue");
  const expectedValue = expectedRaw === "" ? null : Number(expectedRaw);
  const nextFollowUpRaw = text(formData, "nextFollowUpAt");
  const nextFollowUpAt =
    nextFollowUpRaw === ""
      ? null
      : (localDateTimeToUtc(
          nextFollowUpRaw,
          ctx?.org?.timezone ?? "America/St_Johns",
        )?.toISOString() ?? null);

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({
      contact_id: contactId,
      stage,
      source,
      priority,
      assigned_user_id: optionalText(formData, "assignedUserId"),
      expected_value: expectedValue && !Number.isNaN(expectedValue) ? expectedValue : null,
      next_follow_up_at: nextFollowUpAt,
      notes: optionalText(formData, "notes"),
    })
    .eq("organization_id", ctx.org.id)
    .eq("id", id);
  if (error) return { error: dbError(error.message) };

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${id}`);
  return { success: "Lead saved.", leadId: id };
}

/** Board move + detail stage change. Callable imperatively from client. */
export async function updateLeadStageAction(leadId: string, stage: string) {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (!validLeadStage(stage)) return { error: "Unknown stage." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ stage })
    .eq("organization_id", ctx.org.id)
    .eq("id", leadId);
  if (error) return { error: dbError(error.message) };

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${leadId}`);
  return { success: true };
}

export async function deleteLeadAction(leadId: string) {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("organization_id", ctx.org.id)
    .eq("id", leadId);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/contacts");
  return { success: "Lead deleted." };
}

/* ── custom field definitions (settings) ─────────────────────────────── */

export async function upsertCustomFieldAction(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can manage custom fields." };
  }

  const name = text(formData, "name");
  if (!name) return { error: "Field name is required." };
  const fieldType = text(formData, "fieldType");
  if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(fieldType)) {
    return { error: "Unknown field type." };
  }

  const rawKey = text(formData, "fieldKey");
  const fieldKey =
    rawKey ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  if (!/^[a-z0-9_]+$/.test(fieldKey)) {
    return { error: "Field key can only contain lowercase letters, numbers and underscores." };
  }

  const optionsText = text(formData, "options");
  const options = optionsText
    ? optionsText
        .split(/\r?\n/)
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  const payload = {
    name,
    field_key: fieldKey,
    field_type: fieldType,
    options,
    required: formData.get("required") === "on",
    sort_order: Number(text(formData, "sortOrder") || 0),
    is_active: formData.get("isActive") === "on",
  };

  const supabase = await createClient();
  const id = optionalText(formData, "id");
  const { error } = id
    ? await supabase
        .from("custom_fields")
        .update(payload)
        .eq("organization_id", ctx.org.id)
        .eq("id", id)
    : await supabase
        .from("custom_fields")
        .insert({ ...payload, organization_id: ctx.org.id, entity_type: "contact" });
  if (error) {
    if (/unique/i.test(error.message)) return { error: "A field with that key already exists." };
    return { error: dbError(error.message) };
  }

  revalidatePath("/dashboard/settings/fields");
  return { success: id ? "Field updated." : "Field created." };
}

export async function deleteCustomFieldAction(fieldId: string) {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can delete custom fields." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("custom_fields").delete().eq("id", fieldId);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/dashboard/settings/fields");
  return { success: "Field deleted." };
}

/* ── CSV import (PRD §36–37) ─────────────────────────────────────────── */

export interface ImportSummary {
  file: string;
  total: number;
  created: number;
  duplicates: number;
  skipped: number;
  /** Sample of duplicate rows for manual review (email/name + row). */
  samples: Array<{ row: number; value: string; reason: string }>;
}

export async function importContactsCsvAction(
  _prev: CrmState,
  formData: FormData,
): Promise<CrmState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };

  const csvText = String(formData.get("csvText") ?? "");
  const mappingRaw = parseJsonField(formData, "mappingJson");
  if (!csvText) return { error: "No file data received — please try again." };
  if (mappingRaw == null || typeof mappingRaw !== "object" || Array.isArray(mappingRaw)) {
    return { error: "Column mapping is missing or invalid." };
  }
  const mapping = mappingRaw as Record<string, number>;

  const parsed = parseCsv(csvText);
  const rows = parsed.rows;
  if (rows.length === 0) return { error: "The file contains no data rows." };

  const supabase = await createClient();

  // Existing normalized emails + phones for duplicate detection (never merge).
  const { data: existing } = await supabase
    .from("contacts")
    .select("email, phone")
    .eq("organization_id", ctx.org.id)
    .limit(50000);
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const c of existing ?? []) {
    const e = String(c.email ?? "")
      .trim()
      .toLowerCase();
    if (e) emails.add(e);
    const p = String(c.phone ?? "").replace(/\D/g, "");
    if (p) phones.add(p);
  }

  // Resolve + (if needed) create tags referenced by the import.
  let tagIdByName = new Map<string, string>();
  const tagColumnIdx = mapping.tags;
  if (tagColumnIdx != null) {
    const { data: tagRows } = await supabase
      .from("tags")
      .select("id, name")
      .eq("organization_id", ctx.org.id);
    tagIdByName = new Map((tagRows ?? []).map((t) => [String(t.name).toLowerCase(), String(t.id)]));
    const wanted = new Set<string>();
    for (const row of rows) {
      const cell = row[tagColumnIdx ?? 0] ?? "";
      for (const rawTag of cell.split(/[;|]/)) {
        const tagName = rawTag.trim();
        if (tagName && !tagIdByName.has(tagName.toLowerCase())) wanted.add(tagName);
      }
    }
    if (wanted.size > 0) {
      await supabase
        .from("tags")
        .insert([...wanted].map((name) => ({ organization_id: ctx.org.id, name })));
      const { data: after } = await supabase
        .from("tags")
        .select("id, name")
        .eq("organization_id", ctx.org.id);
      tagIdByName = new Map((after ?? []).map((t) => [String(t.name).toLowerCase(), String(t.id)]));
    }
  }

  const summary: ImportSummary = {
    file: String(formData.get("fileName") ?? "upload.csv"),
    total: rows.length,
    created: 0,
    duplicates: 0,
    skipped: 0,
    samples: [],
  };

  const read = (row: string[], key: string): string => {
    const idx = mapping[key];
    if (idx == null) return "";
    return (row[idx] ?? "").trim();
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstName = read(row, "firstName") || read(row, "first_name") || read(row, "First Name");
    const lastName = read(row, "lastName") || read(row, "last_name") || read(row, "Last Name");
    const email = read(row, "email") || read(row, "Email");
    const phone = read(row, "phone") || read(row, "Phone");

    if (!firstName && !lastName && !email && !phone) {
      summary.skipped++;
      continue;
    }

    // Duplicate detection: email (case-insensitive), then phone (digits).
    const em = email.trim().toLowerCase();
    const ph = phone.replace(/\D/g, "");
    const dupReason = em && emails.has(em) ? "email" : ph && phones.has(ph) ? "phone" : null;
    if (dupReason) {
      summary.duplicates++;
      if (summary.samples.length < 10) {
        summary.samples.push({
          row: i + 2,
          value: `${firstName} ${lastName}`.trim() || email,
          reason: `matches an existing contact by ${dupReason}`,
        });
      }
      continue;
    }

    const inserted = await supabase
      .from("contacts")
      .insert({
        organization_id: ctx.org.id,
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        company: read(row, "company") || read(row, "Company") || null,
        address: read(row, "address") || read(row, "Address") || null,
        city: read(row, "city") || read(row, "City") || null,
        province: read(row, "province") || read(row, "Province") || read(row, "State") || null,
        country: read(row, "country") || read(row, "Country") || null,
        postal_code: read(row, "postalCode") || read(row, "Postal") || read(row, "Zip") || null,
        contact_type: read(row, "contactType") || read(row, "Contact Type") || "Lead",
        source: read(row, "source") || read(row, "Source") || "Import",
        notes: read(row, "notes") || read(row, "Notes") || null,
      })
      .select("id")
      .single();
    if (!inserted || !("id" in inserted)) {
      summary.skipped++;
      continue;
    }
    const contactId = String(inserted.id);
    summary.created++;

    if (contactId && tagColumnIdx != null) {
      const cell = row[tagColumnIdx] ?? "";
      const tagIds = cell
        .split(/[;|]/)
        .map((t) => tagIdByName.get(t.trim().toLowerCase()))
        .filter((id): id is string => Boolean(id));
      if (tagIds.length > 0) {
        await supabase
          .from("contact_tags")
          .insert(tagIds.map((tag_id) => ({ contact_id: contactId, tag_id })));
      }
    }
  }

  revalidatePath("/dashboard/contacts");
  return { success: "Import finished.", import: summary };
}
