/**
 * Types for the public business page payload returned by the
 * `get_public_page(p_slug)` RPC (M3). The SQL function is the only way
 * anon data reaches the browser, so these mirror exactly the columns it
 * projects — nothing else ever leaves the database.
 */

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number | null;
  currency: string;
  location_type: "in-person" | "phone" | "video" | "other";
  location_details: string | null;
  booking_enabled: boolean;
}

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "dropdown"
  | "multi_select"
  | "checkbox"
  | "date"
  | "hidden";

export interface PublicFormField {
  id: string;
  label: string;
  field_key: string;
  field_type: FormFieldType;
  required: boolean;
  options: string[];
  placeholder: string | null;
}

export interface PublicForm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  fields: PublicFormField[];
}

export interface PublicResource {
  id: string;
  title: string;
  description: string | null;
  gated: boolean;
  download_count: number;
  file_name: string;
}

export interface PublicOrg {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  postal_code: string | null;
  website_url: string | null;
  social_links: Record<string, string>;
  primary_color: string;
  secondary_color: string;
}

export interface PublicPage {
  org: PublicOrg;
  services: PublicService[];
  forms: PublicForm[];
  resources: PublicResource[];
}

/** Parse the jsonb payload from `get_public_page` (returns null = no such business). */
export function parsePublicPage(payload: unknown): PublicPage | null {
  if (!payload || typeof payload !== "object") return null;
  const page = payload as Record<string, unknown>;
  const org = page.org as Record<string, unknown> | null;
  if (!org || typeof org.name !== "string") return null;
  return {
    org: {
      id: String(org.id),
      name: String(org.name),
      slug: String(org.slug),
      logo_url: (org.logo_url as string | null) ?? null,
      description: (org.description as string | null) ?? null,
      email: (org.email as string | null) ?? null,
      phone: (org.phone as string | null) ?? null,
      address: (org.address as string | null) ?? null,
      city: (org.city as string | null) ?? null,
      province: (org.province as string | null) ?? null,
      country: (org.country as string | null) ?? null,
      postal_code: (org.postal_code as string | null) ?? null,
      website_url: (org.website_url as string | null) ?? null,
      social_links: (org.social_links as Record<string, string>) ?? {},
      primary_color: (org.primary_color as string) ?? "#14532d",
      secondary_color: (org.secondary_color as string) ?? "#f5f5f4",
    },
    services: Array.isArray(page.services)
      ? (page.services as unknown as PublicService[])
      : [],
    forms: Array.isArray(page.forms)
      ? (page.forms as unknown as PublicForm[])
      : [],
    resources: Array.isArray(page.resources)
      ? (page.resources as unknown as PublicResource[])
      : [],
  };
}