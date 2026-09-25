"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyOrg } from "@/lib/auth/org";
import { FORM_FIELD_TYPES } from "@/lib/forms/constants";

export interface FormActionState {
  error?: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface FieldPayload {
  label: string;
  fieldKey: string;
  fieldType: string;
  required: boolean;
  options: string[];
  placeholder: string;
}

function parseFields(formData: FormData): FieldPayload[] | null {
  const raw = String(formData.get("fields") ?? "");
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const seen = new Set<string>();
  const fields: FieldPayload[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const f = item as Record<string, unknown>;
    const label = String(f.label ?? "").trim();
    const fieldKey = String(f.fieldKey ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const fieldType = String(f.fieldType ?? "");
    if (!label || !fieldKey || !FORM_FIELD_TYPES.includes(fieldType as never)) return null;
    if (!/^[a-z0-9_]+$/.test(fieldKey)) return null;
    if (seen.has(fieldKey)) return null;
    seen.add(fieldKey);

    fields.push({
      label,
      fieldKey,
      fieldType,
      required: Boolean(f.required),
      options: String(f.options ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      placeholder: String(f.placeholder ?? "").trim(),
    });
  }
  return fields;
}

/** Owner/admin-only: create a public form with its fields (PRD §22). */
export async function createFormAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can manage forms." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  if (!name) return { error: "Form name is required." };
  if (!SLUG.test(slug)) {
    return { error: "Web address can only contain lowercase letters, numbers, and hyphens." };
  }

  const fields = parseFields(formData);
  if (fields === null)
    return { error: "One of the form fields is invalid. Check labels, keys and types." };

  const supabase = await createClient();
  const { data: formRow, error } = await supabase
    .from("public_forms")
    .insert({
      organization_id: ctx.org.id,
      name,
      slug,
      description: String(formData.get("description") ?? "").trim() || null,
      source: String(formData.get("source") ?? "Public website").trim() || "Public website",
      active: formData.get("active") === "1",
    })
    .select("id")
    .maybeSingle();

  if (error) return { error: friendlyDbError(error.message) };
  if (!formRow) return { error: "Could not create the form." };

  const fieldRows = fields.map((f, i) => ({
    form_id: formRow.id as string,
    label: f.label,
    field_key: f.fieldKey,
    field_type: f.fieldType,
    required: f.required,
    options: f.options,
    placeholder: f.placeholder || null,
    sort_order: i,
  }));
  if (fieldRows.length > 0) {
    const { error: fieldsError } = await supabase.from("form_fields").insert(fieldRows);
    if (fieldsError) return { error: friendlyDbError(fieldsError.message) };
  }

  revalidatePath("/dashboard/forms");
  redirect("/dashboard/forms");
}

/** Owner/admin-only: update a form (replaces its fields wholesale). */
export async function updateFormAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can manage forms." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing form id." };

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  if (!name) return { error: "Form name is required." };
  if (!SLUG.test(slug)) {
    return { error: "Web address can only contain lowercase letters, numbers, and hyphens." };
  }

  const fields = parseFields(formData);
  if (fields === null)
    return { error: "One of the form fields is invalid. Check labels, keys and types." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("public_forms")
    .update({
      name,
      slug,
      description: String(formData.get("description") ?? "").trim() || null,
      source: String(formData.get("source") ?? "Public website").trim() || "Public website",
      active: formData.get("active") === "1",
    })
    .eq("id", id)
    .eq("organization_id", ctx.org.id);

  if (error) return { error: friendlyDbError(error.message) };

  // Wholesale replace: simplest correct behavior for a field builder.
  await supabase.from("form_fields").delete().eq("form_id", id);
  const fieldRows = fields.map((f, i) => ({
    form_id: id,
    label: f.label,
    field_key: f.fieldKey,
    field_type: f.fieldType,
    required: f.required,
    options: f.options,
    placeholder: f.placeholder || null,
    sort_order: i,
  }));
  if (fieldRows.length > 0) {
    const { error: fieldsError } = await supabase.from("form_fields").insert(fieldRows);
    if (fieldsError) return { error: friendlyDbError(fieldsError.message) };
  }

  revalidatePath("/dashboard/forms");
  redirect("/dashboard/forms");
}

/** Owner/admin-only: delete a form (fields cascade). */
export async function deleteFormAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx) return;
  if (ctx.role !== "owner" && ctx.role !== "admin") return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("public_forms").delete().eq("id", id).eq("organization_id", ctx.org.id);
  revalidatePath("/dashboard/forms");
}

function friendlyDbError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You don't have permission to manage forms.";
  }
  if (/duplicate key|unique/i.test(message)) {
    return "Another form already uses that web address.";
  }
  return "Something went wrong saving the form. Please try again.";
}
