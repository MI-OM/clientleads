"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyOrg } from "@/lib/auth/org";
import { isValidTimeZone } from "@/lib/timezone";

export interface SettingsState {
  error?: string;
  success?: string;
}

const SOCIAL_KEYS = ["instagram", "facebook", "linkedin", "x", "youtube"] as const;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function friendlyDbError(message: string): string {
  if (/unique/i.test(message) && /slug/i.test(message)) {
    return "That web address (slug) is already taken by another business.";
  }
  if (/row-level security/i.test(message)) {
    return "You don't have permission to edit this organization.";
  }
  return "Something went wrong saving your changes. Please try again.";
}

/** Owner/admin-only: update the organization profile and branding (PRD §8). */
export async function updateOrganizationAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can edit business settings." };
  }

  const orgId = String(formData.get("id") ?? "");
  if (orgId !== ctx.org.id) {
    return { error: "Organization mismatch — please refresh and try again." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const primaryColor = String(formData.get("primaryColor") ?? "").trim();
  const secondaryColor = String(formData.get("secondaryColor") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "America/Halifax").trim();

  if (!name) return { error: "Business name is required." };
  if (!SLUG.test(slug)) {
    return {
      error: "Web address can only contain lowercase letters, numbers, and hyphens.",
    };
  }
  if (!HEX_COLOR.test(primaryColor) || !HEX_COLOR.test(secondaryColor)) {
    return { error: "Brand colors must be 6-digit hex codes, e.g. #14532d." };
  }
  if (!isValidTimeZone(timezone)) return { error: "Choose a valid IANA timezone." };

  const social_links: Record<string, string> = {};
  for (const key of SOCIAL_KEYS) {
    const value = String(formData.get(`social_${key}`) ?? "").trim();
    if (value) social_links[key] = value;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      slug,
      description: String(formData.get("description") ?? "").trim() || null,
      about: String(formData.get("about") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      website_url: String(formData.get("websiteUrl") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      province: String(formData.get("province") ?? "").trim() || null,
      country: String(formData.get("country") ?? "").trim() || null,
      postal_code: String(formData.get("postalCode") ?? "").trim() || null,
      timezone,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      social_links,
    })
    .eq("id", orgId);

  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/dashboard/settings");
  return { success: "Business settings saved." };
}

/** Owner/admin-only: upload a logo into the org-scoped asset bucket. */
export async function uploadLogoAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can update the logo." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "Logo must be smaller than 10 MB." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "Only image files are allowed." };
  }

  const extensions = file.name.split(".").pop()?.toLowerCase() ?? "";
  const ext = extensions && extensions.length <= 5 ? `.${extensions}` : "";
  const path = `orgs/${ctx.org.id}/logo-${Date.now()}${ext}`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("org-assets")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return { error: friendlyDbError(uploadError.message) };

  const {
    data: { publicUrl },
  } = supabase.storage.from("org-assets").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("organizations")
    .update({ logo_url: publicUrl })
    .eq("id", ctx.org.id);

  if (updateError) return { error: friendlyDbError(updateError.message) };

  revalidatePath("/dashboard/settings");
  return { success: "Logo updated." };
}
