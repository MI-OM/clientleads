"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyOrg } from "@/lib/auth/org";

export interface ResourceActionState {
  error?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // bucket limit (50 MB)

function safeExt(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext && ext.length <= 8 ? `.${ext}` : "";
}

/** Owner/admin-only: create a resource with an uploaded file (PRD §30). */
export async function createResourceAction(
  _prev: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can manage resources." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: "Files must be smaller than 50 MB." };
  }

  const fileName = file.name.trim() || "download";
  const path = `orgs/${ctx.org.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from("resources")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) return { error: friendlyDbError(uploadError.message) };

  const thumbnail = formData.get("thumbnail");
  let thumbnailPath: string | null = null;
  if (thumbnail instanceof File && thumbnail.size > 0) {
    if (thumbnail.size > MAX_FILE_SIZE) {
      await supabase.storage.from("resources").remove([path]);
      return { error: "Thumbnails must be smaller than 50 MB." };
    }
    thumbnailPath = `orgs/${ctx.org.id}/thumb-${Date.now()}-${thumbnail.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: thumbError } = await supabase.storage
      .from("resources")
      .upload(thumbnailPath, thumbnail, { contentType: thumbnail.type, upsert: false });
    if (thumbError) {
      await supabase.storage.from("resources").remove([path]);
      return { error: friendlyDbError(thumbError.message) };
    }
  }

  const { error } = await supabase.from("resources").insert({
    organization_id: ctx.org.id,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    file_path: path,
    file_name: fileName,
    mime_type: file.type || null,
    file_size: file.size,
    thumbnail_path: thumbnailPath,
    visibility: formData.get("visibility") === "private" ? "private" : "public",
    published: formData.get("published") === "1",
    gated: formData.get("gated") === "1",
  });

  if (error) {
    await supabase.storage
      .from("resources")
      .remove([path, ...(thumbnailPath ? [thumbnailPath] : [])]);
    return { error: friendlyDbError(error.message) };
  }

  revalidatePath("/dashboard/resources");
  redirect("/dashboard/resources");
}

/** Owner/admin-only: update a resource, optionally replacing its file. */
export async function updateResourceAction(
  _prev: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can manage resources." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing resource id." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("resources")
    .select("file_path, thumbnail_path")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    visibility: formData.get("visibility") === "private" ? "private" : "public",
    published: formData.get("published") === "1",
    gated: formData.get("gated") === "1",
  };

  const file = formData.get("file");
  let newPath: string | null = null;
  let newThumbPath: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_SIZE) return { error: "Files must be smaller than 50 MB." };
    newPath = `orgs/${ctx.org.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage
      .from("resources")
      .upload(newPath, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) return { error: friendlyDbError(uploadError.message) };
    patch.file_path = newPath;
    patch.file_name = file.name.trim() || "download";
    patch.mime_type = file.type || null;
    patch.file_size = file.size;
  }

  const thumbnail = formData.get("thumbnail");
  if (thumbnail instanceof File && thumbnail.size > 0) {
    if (thumbnail.size > MAX_FILE_SIZE) {
      if (newPath) await supabase.storage.from("resources").remove([newPath]);
      return { error: "Thumbnails must be smaller than 50 MB." };
    }
    newThumbPath = `orgs/${ctx.org.id}/thumb-${Date.now()}-${thumbnail.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: thumbError } = await supabase.storage
      .from("resources")
      .upload(newThumbPath, thumbnail, { contentType: thumbnail.type, upsert: false });
    if (thumbError) {
      if (newPath) await supabase.storage.from("resources").remove([newPath]);
      return { error: friendlyDbError(thumbError.message) };
    }
    patch.thumbnail_path = newThumbPath;
  }

  const { error } = await supabase
    .from("resources")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", ctx.org.id);

  if (error) {
    const toRemove = [newPath, newThumbPath].filter((p): p is string => Boolean(p));
    if (toRemove.length > 0) await supabase.storage.from("resources").remove(toRemove);
    return { error: friendlyDbError(error.message) };
  }

  // Clean up replaced objects
  const toRemove: string[] = [];
  if (newPath && current?.file_path && current.file_path !== newPath) {
    toRemove.push(current.file_path as string);
  }
  if (newThumbPath && current?.thumbnail_path && current.thumbnail_path !== newThumbPath) {
    toRemove.push(current.thumbnail_path as string);
  }
  if (toRemove.length > 0) {
    await supabase.storage.from("resources").remove(toRemove);
  }

  revalidatePath("/dashboard/resources");
  redirect("/dashboard/resources");
}

/** Owner/admin-only: delete a resource and its stored files. */
export async function deleteResourceAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx) return;
  if (ctx.role !== "owner" && ctx.role !== "admin") return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("resources")
    .select("file_path, thumbnail_path")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();

  await supabase.from("resources").delete().eq("id", id).eq("organization_id", ctx.org.id);
  if (row) {
    const paths = [row.file_path, row.thumbnail_path].filter((p): p is string => Boolean(p));
    if (paths.length > 0) await supabase.storage.from("resources").remove(paths);
  }
  revalidatePath("/dashboard/resources");
}

function friendlyDbError(message: string): string {
  if (/row-level security|permission/i.test(message)) {
    return "You don't have permission to manage resources.";
  }
  if (/size|too large|storage/i.test(message)) {
    return "The file could not be uploaded — make sure it is smaller than 50 MB.";
  }
  return "Something went wrong saving the resource. Please try again.";
}