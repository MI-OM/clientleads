import { createClient } from "@/lib/supabase/server";

export interface FormField {
  id: string;
  formId: string;
  label: string;
  fieldKey: string;
  fieldType: string;
  required: boolean;
  options: string[];
  placeholder: string | null;
  sortOrder: number;
}

export interface PublicForm {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  source: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  fields: FormField[];
}

interface FormRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  source: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function mapForm(row: FormRow, fields: FormField[]): PublicForm {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    source: row.source,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fields,
  };
}

export async function listForms(orgId: string): Promise<PublicForm[]> {
  const supabase = await createClient();
  const { data: formRows, error } = await supabase
    .from("public_forms")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const forms = (formRows ?? []) as unknown as FormRow[];
  const fields = await listFieldsForForms(orgId, forms.map((f) => f.id));
  return forms.map((f) => mapForm(f, fields.get(f.id) ?? []));
}

async function listFieldsForForms(
  orgId: string,
  formIds: string[],
): Promise<Map<string, FormField[]>> {
  const supabase = await createClient();
  if (formIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("form_fields")
    .select("*")
    .in("form_id", formIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const byForm = new Map<string, FormField[]>();
  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const formId = String(row.form_id);
    const field: FormField = {
      id: String(row.id),
      formId,
      label: String(row.label),
      fieldKey: String(row.field_key),
      fieldType: String(row.field_type),
      required: Boolean(row.required),
      options: (row.options as string[]) ?? [],
      placeholder: (row.placeholder as string | null) ?? null,
      sortOrder: Number(row.sort_order),
    };
    const list = byForm.get(formId) ?? [];
    list.push(field);
    byForm.set(formId, list);
  }
  return byForm;
}

export async function getForm(orgId: string, id: string): Promise<PublicForm | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_forms")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const fields = await listFieldsForForms(orgId, [id]);
  return mapForm(data as unknown as FormRow, fields.get(id) ?? []);
}