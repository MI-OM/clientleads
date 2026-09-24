"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getMyOrg } from "@/lib/auth/org";
import { deriveTemplateVariables } from "@/lib/email/campaign";
import {
  parseTemplateSections,
  sanitizeRichHtml,
  type TemplateSection,
} from "@/lib/campaigns/template-sections";

export interface TemplateActionState {
  error?: string;
  ok?: boolean;
}

function canManage(ctx: Awaited<ReturnType<typeof getMyOrg>>): ctx is NonNullable<typeof ctx> {
  return !!ctx && (ctx.role === "owner" || ctx.role === "admin");
}

function friendlyDbError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You don't have permission to manage templates.";
  }
  if (/duplicate key|unique/i.test(message)) {
    return "A template with that name already exists.";
  }
  return "Something went wrong saving the template. Please try again.";
}

async function uploadTemplateImage(
  ctx: NonNullable<Awaited<ReturnType<typeof getMyOrg>>>,
  formData: FormData,
) {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > 10 * 1024 * 1024 || !file.type.startsWith("image/")) {
    throw new Error("Template images must be image files smaller than 10 MB.");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `orgs/${ctx.org.id}/templates/${randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from("org-assets").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from("org-assets").getPublicUrl(path).data.publicUrl;
}

async function hostSectionImages(
  ctx: NonNullable<Awaited<ReturnType<typeof getMyOrg>>>,
  sections: TemplateSection[],
  formData: FormData,
): Promise<TemplateSection[]> {
  const supabase = await createClient();
  const uploadAsset = async (
    data: ArrayBuffer | Buffer,
    contentType: string,
    extension: string,
  ) => {
    const path = `orgs/${ctx.org.id}/templates/${randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("org-assets").upload(path, data, {
      contentType,
      upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from("org-assets").getPublicUrl(path).data.publicUrl;
  };
  return Promise.all(
    sections.map(async (section) => {
      if (section.type !== "image") return section;
      const upload = formData.get(`sectionImage_${section.id}`);
      if (upload instanceof File && upload.size > 0) {
        if (upload.size > 10 * 1024 * 1024 || !upload.type.startsWith("image/")) {
          throw new Error("Section images must be image files smaller than 10 MB.");
        }
        const extension = upload.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const imageUrl = await uploadAsset(await upload.arrayBuffer(), upload.type, extension);
        return { ...section, imageUrl };
      }
      if (!section.imageUrl?.trim()) return section;
      let url: URL;
      try {
        url = new URL(section.imageUrl.trim());
      } catch {
        throw new Error("Each image section needs a valid image URL.");
      }
      if (url.protocol !== "https:") {
        throw new Error("Image URLs must use HTTPS so email recipients can load them.");
      }
      const response = await fetch(url, {
        headers: {
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "user-agent": "Mozilla/5.0 ClientLeads image importer",
        },
        signal: AbortSignal.timeout(10_000),
      });
      // Some public image CDNs reject server-side copying while still allowing
      // browsers and email clients to load the original HTTPS URL.
      if (response.status === 401 || response.status === 403) return section;
      if (!response.ok) throw new Error(`Unable to download image URL (${response.status}).`);
      const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!contentType.startsWith("image/") || buffer.length > 10 * 1024 * 1024) {
        throw new Error("Image URLs must point to an image smaller than 10 MB.");
      }
      const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const imageUrl = await uploadAsset(buffer, contentType, ext);
      return { ...section, imageUrl };
    }),
  );
}

function readTemplateData(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  let sections: TemplateSection[] = [];
  try {
    sections = parseTemplateSections(JSON.parse(String(formData.get("sections") ?? "[]"))).map(
      (section) => ({
        ...section,
        bodyHtml: section.bodyHtml ? sanitizeRichHtml(section.bodyHtml) : undefined,
        backgroundColor: /^#[0-9a-f]{6}$/i.test(section.backgroundColor ?? "")
          ? section.backgroundColor
          : undefined,
      }),
    );
  } catch {
    sections = [];
  }
  return { name, subject, body, sections };
}

function validColor(value: string): string | null {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

/** Owner/admin-only: create an email template (PRD §25). */
export async function createTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return { error: "Only owners and administrators can manage templates." };

  const { name, subject, body, sections } = readTemplateData(formData);
  if (!name) return { error: "Template name is required." };
  if (!subject) return { error: "Email subject is required." };
  if (!body) return { error: "Email body is required." };

  let hostedSections: TemplateSection[];
  try {
    hostedSections = await hostSectionImages(ctx, sections, formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to host template image." };
  }
  const variables = deriveTemplateVariables(
    `${subject}\n${body}\n${JSON.stringify(hostedSections)}`,
  );
  const bodyBackgroundColor = validColor(String(formData.get("bodyBackgroundColor") ?? ""));
  let imageUrl: string | null = null;
  try {
    imageUrl = await uploadTemplateImage(ctx, formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to upload template image." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").insert({
    organization_id: ctx.org.id,
    name,
    subject,
    body,
    variables,
    image_url: imageUrl,
    sections: hostedSections,
    body_background_color: bodyBackgroundColor,
  });
  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/dashboard/templates");
  redirect("/dashboard/templates");
}

/** Owner/admin-only: update a template. */
export async function updateTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return { error: "Only owners and administrators can manage templates." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing template id." };

  const { name, subject, body, sections } = readTemplateData(formData);
  if (!name) return { error: "Template name is required." };
  if (!subject) return { error: "Email subject is required." };
  if (!body) return { error: "Email body is required." };

  let hostedSections: TemplateSection[];
  try {
    hostedSections = await hostSectionImages(ctx, sections, formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to host template image." };
  }
  const variables = deriveTemplateVariables(
    `${subject}\n${body}\n${JSON.stringify(hostedSections)}`,
  );
  const bodyBackgroundColor = validColor(String(formData.get("bodyBackgroundColor") ?? ""));
  let imageUrl: string | null = null;
  try {
    imageUrl = await uploadTemplateImage(ctx, formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to upload template image." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .update({
      name,
      subject,
      body,
      variables,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      sections: hostedSections,
      body_background_color: bodyBackgroundColor,
    })
    .eq("id", id)
    .eq("organization_id", ctx.org.id);
  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/dashboard/templates");
  redirect("/dashboard/templates");
}

/** Owner/admin-only: delete a template. */
export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("email_templates").delete().eq("id", id).eq("organization_id", ctx.org.id);
  revalidatePath("/dashboard/templates");
}
