import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PAGE_SIZE } from "./constants";
import type { Activity, Contact, CustomField, Lead, OrgMember, Tag } from "./types";

/* ── mapping helpers ─────────────────────────────────────────────────── */

export function mapContact(row: Record<string, unknown>): Contact {
  const firstName = String(row.first_name ?? "");
  const lastName = String(row.last_name ?? "");
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim() || "Unnamed contact",
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    province: (row.province as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    postalCode: (row.postal_code as string | null) ?? null,
    contactType: String(row.contact_type ?? "Lead"),
    leadStatus: String(row.lead_status ?? "New"),
    source: String(row.source ?? "Manual entry"),
    assignedUserId: (row.assigned_user_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    marketingOptIn: Boolean(row.marketing_opt_in ?? true),
    unsubscribedAt: (row.unsubscribed_at as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    tags: [],
    customValues: {},
  };
}

export function mapTag(row: Record<string, unknown>): Omit<Tag, "contactCount"> {
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
  };
}

export function mapCustomField(row: Record<string, unknown>): CustomField {
  return {
    id: String(row.id),
    entityType: String(row.entity_type ?? "contact"),
    name: String(row.name),
    fieldKey: String(row.field_key),
    fieldType: String(row.field_type),
    options: Array.isArray(row.options) ? (row.options as unknown[]).map(String) : [],
    required: Boolean(row.required),
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active ?? true),
  };
}

export function mapLead(row: Record<string, unknown>): Lead {
  const contact = row.contact as { first_name?: string; last_name?: string } | null | undefined;
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    contactId: (row.contact_id as string | null) ?? null,
    contactName: contact
      ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Unnamed contact"
      : null,
    stage: String(row.stage ?? "New"),
    source: String(row.source ?? "Manual entry"),
    priority: String(row.priority ?? "Normal"),
    assignedUserId: (row.assigned_user_id as string | null) ?? null,
    expectedValue: row.expected_value == null ? null : Number(row.expected_value),
    nextFollowUpAt: (row.next_follow_up_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapActivity(row: Record<string, unknown>): Activity {
  return {
    id: String(row.id),
    activityType: String(row.activity_type),
    subject: (row.subject as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? ""),
    userId: (row.user_id as string | null) ?? null,
    contactId: (row.contact_id as string | null) ?? null,
    leadId: (row.lead_id as string | null) ?? null,
    userName: null,
  };
}

/* ── contacts ────────────────────────────────────────────────────────── */

/** Lightweight id+name picker for forms (non-archived, newest first). */
export const listContactOptions = cache(
  async (orgId: string, limit = 3000): Promise<Array<{ id: string; name: string }>> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((r) => ({
      id: String(r.id),
      name:
        `${String(r.first_name ?? "")} ${String(r.last_name ?? "")}`.trim() || "Unnamed contact",
    }));
  },
);

export interface ContactListOptions {
  search?: string;
  contactType?: string;
  tagId?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ContactListResult {
  contacts: Contact[];
  total: number;
  page: number;
  totalPages: number;
}

export const listContacts = cache(
  async (orgId: string, opts: ContactListOptions = {}): Promise<ContactListResult> => {
    const supabase = await createClient();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
    const search = opts.search?.trim();

    let contactIds: string[] | null = null;
    if (opts.tagId) {
      const { data } = await supabase
        .from("contact_tags")
        .select("contact_id")
        .eq("tag_id", opts.tagId)
        .limit(5000);
      contactIds = (data ?? []).map((r) => r.contact_id as string);
      if (contactIds.length === 0) {
        return { contacts: [], total: 0, page, totalPages: 0 };
      }
    }

    let query = supabase
      .from("contacts")
      .select(
        "id, organization_id, first_name, last_name, email, phone, company, contact_type, source, lead_status, assigned_user_id, marketing_opt_in, archived_at, created_at, updated_at",
        { count: "exact" },
      )
      .eq("organization_id", orgId);

    if (!opts.includeArchived) query = query.is("archived_at", null);
    if (opts.contactType) query = query.eq("contact_type", opts.contactType);
    if (contactIds) query = query.in("id", contactIds);
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(
        `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},company.ilike.${pattern}`,
      );
    }

    const from = (page - 1) * pageSize;
    query = query.order("updated_at", { ascending: false }).range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) return { contacts: [], total: 0, page, totalPages: 0 };

    let contacts = (data ?? []).map((r) => mapContact(r as Record<string, unknown>));

    // Attach tag names (batched).
    if (contacts.length > 0) {
      const ids = contacts.map((c) => c.id);
      const { data: tagLinks } = await supabase
        .from("contact_tags")
        .select("contact_id, tag:tags(name)")
        .in("contact_id", ids);
      const byContact = new Map<string, string[]>();
      for (const link of tagLinks ?? []) {
        const key = link.contact_id as string;
        const tag = link.tag as { name?: string } | null;
        if (tag?.name) {
          byContact.set(key, [...(byContact.get(key) ?? []), tag.name]);
        }
      }
      contacts = contacts.map((c) => ({
        ...c,
        tags: byContact.get(c.id) ?? [],
      }));
    }

    const total = count ?? 0;
    return { contacts, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  },
);

export const getContact = cache(async (orgId: string, id: string): Promise<Contact | null> => {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("contacts")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!rows) return null;

  const contact = mapContact(rows as Record<string, unknown>);

  const { data: tagLinks } = await supabase
    .from("contact_tags")
    .select("tag:tags(name)")
    .eq("contact_id", id);
  contact.tags = (tagLinks ?? [])
    .map((l) => (l.tag as { name?: string } | null)?.name)
    .filter((n): n is string => Boolean(n))
    .sort();

  const fields = await listActiveCustomFields(orgId);
  const { data: values } = await supabase
    .from("contact_custom_values")
    .select("custom_field_id, value")
    .eq("contact_id", id);
  const valueMap = new Map(
    (values ?? []).map((v) => [String(v.custom_field_id), v.value as unknown]),
  );
  for (const field of fields) {
    if (valueMap.has(field.id)) contact.customValues[field.fieldKey] = valueMap.get(field.id);
  }

  return contact;
});

/** The lead attached to a contact, if any. */
export const getLeadForContact = cache(async (orgId: string, contactId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, stage")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!data) return null;
  return { id: String(data.id), stage: String(data.stage) };
});

/* ── tags ────────────────────────────────────────────────────────────── */

export const listTags = cache(async (orgId: string): Promise<Tag[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tags")
    .select("id, name, description")
    .eq("organization_id", orgId)
    .order("name", { ascending: true });

  const { data: links } = await supabase.from("contact_tags").select("contact_id, tag_id");
  const counts = new Map<string, number>();
  for (const link of links ?? []) {
    const key = String(link.tag_id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (data ?? []).map((r) => ({
    ...mapTag(r as Record<string, unknown>),
    contactCount: counts.get(String(r.id)) ?? 0,
  }));
});

/* ── custom fields ───────────────────────────────────────────────────── */

export const listActiveCustomFields = cache(
  async (orgId: string, entityType = "contact"): Promise<CustomField[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("custom_fields")
      .select(
        "id, entity_type, name, field_key, field_type, options, required, sort_order, is_active",
      )
      .eq("organization_id", orgId)
      .eq("entity_type", entityType)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return (data ?? []).map((r) => mapCustomField(r as Record<string, unknown>));
  },
);

export const listAllCustomFields = cache(
  async (orgId: string, entityType = "contact"): Promise<CustomField[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("custom_fields")
      .select(
        "id, entity_type, name, field_key, field_type, options, required, sort_order, is_active",
      )
      .eq("organization_id", orgId)
      .eq("entity_type", entityType)
      .order("sort_order", { ascending: true });
    return (data ?? []).map((r) => mapCustomField(r as Record<string, unknown>));
  },
);

/* ── leads ───────────────────────────────────────────────────────────── */

export const listLeads = cache(async (orgId: string): Promise<Lead[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      "id, organization_id, contact_id, stage, source, priority, assigned_user_id, expected_value, next_follow_up_at, notes, created_at, updated_at, contact:contacts(first_name, last_name)",
    )
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1000);
  return (data ?? []).map((r) => mapLead(r as Record<string, unknown>));
});

export const getLead = cache(async (orgId: string, id: string): Promise<Lead | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      "id, organization_id, contact_id, stage, source, priority, assigned_user_id, expected_value, next_follow_up_at, notes, created_at, updated_at, contact:contacts(first_name, last_name)",
    )
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ? mapLead(data as Record<string, unknown>) : null;
});

/* ── activities ──────────────────────────────────────────────────────── */

export const listActivities = cache(
  async (
    orgId: string,
    opts: { contactId?: string; leadId?: string; limit?: number } = {},
  ): Promise<Activity[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("activities")
      .select(
        "id, activity_type, subject, description, metadata, created_at, user_id, contact_id, lead_id",
      )
      .eq("organization_id", orgId);
    if (opts.contactId) query = query.eq("contact_id", opts.contactId);
    if (opts.leadId) query = query.eq("lead_id", opts.leadId);
    query = query.order("created_at", { ascending: false }).limit(opts.limit ?? 50);

    const { data } = await query;
    const activities = (data ?? []).map((r) => mapActivity(r as Record<string, unknown>));

    const userIds = [...new Set(activities.map((a) => a.userId).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      const names = new Map((profiles ?? []).map((p) => [String(p.id), String(p.full_name ?? "")]));
      for (const a of activities) {
        if (a.userId) a.userName = names.get(a.userId) ?? null;
      }
    }
    return activities;
  },
);

/* ── org members (assignee pickers, activity names) ──────────────────── */

export const listOrgMembers = cache(async (orgId: string): Promise<OrgMember[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  const members = (data ?? []).map((m) => ({
    id: String(m.user_id),
    role: String(m.role),
    fullName: "",
  }));

  const ids = members.map((m) => m.id);
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    const names = new Map((profiles ?? []).map((p) => [String(p.id), String(p.full_name ?? "")]));
    for (const m of members) m.fullName = names.get(m.id) ?? "";
  }
  return members;
});

/* ── dashboard counts ────────────────────────────────────────────────── */

export const getDashboardCounts = cache(async (orgId: string) => {
  const supabase = await createClient();
  const [contacts, openLeads] = await Promise.all([
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("archived_at", null),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .not("stage", "in", '("Won","Lost")'),
  ]);
  return {
    contacts: contacts.count ?? 0,
    openLeads: openLeads.count ?? 0,
  };
});
