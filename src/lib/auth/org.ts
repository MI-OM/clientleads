import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrgRole = "owner" | "admin" | "staff";

export interface Org {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  postalCode: string | null;
  timezone: string;
  websiteUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  socialLinks: Record<string, string>;
}

export interface OrgContext {
  org: Org;
  role: OrgRole;
}

function mapOrg(row: Record<string, unknown>): Org {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    logoUrl: (row.logo_url as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    province: (row.province as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    postalCode: (row.postal_code as string | null) ?? null,
    timezone: (row.timezone as string) ?? "America/Halifax",
    websiteUrl: (row.website_url as string | null) ?? null,
    primaryColor: (row.primary_color as string) ?? "#14532d",
    secondaryColor: (row.secondary_color as string) ?? "#f5f5f4",
    socialLinks: (row.social_links as Record<string, string>) ?? {},
  };
}

/** Current authenticated user, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Current authenticated user, or redirect to /login. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The user's organization + role (single-org bootstrap: first membership).
 * Returns null when the user has no org yet or the DB isn't ready.
 */
export const getMyOrg = cache(async (): Promise<OrgContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const organization = data.organization as unknown as
    | Record<string, unknown>
    | null;
  if (!organization) return null;

  return { org: mapOrg(organization), role: data.role as OrgRole };
});

/** Convenience: require org context for owner/admin-gated flows. */
export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getMyOrg();
  if (!ctx) {
    redirect("/login");
  }
  return ctx;
}