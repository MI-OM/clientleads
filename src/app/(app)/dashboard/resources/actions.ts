"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyOrg } from "@/lib/auth/org";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResourceActionState {
  error?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // bucket limit (50 MB)

/**
 * File uploads go straight from the browser to the private `resources` bucket
 * (storage RLS limits writes to the user's own org + owner/admin role). The
 * server action only records metadata, so nothing large crosses the Server
 * Action body (1 MB Next default, 4.5 MB Vercel functions).
 *
 * Owned paths are minted client-side as `orgs/<orgId>/<file>` — we re-check
 * that the claimed path sits inside the caller's org prefix and actually
 * exists in storage before creating the row.
 */
function parseOwnedPath(orgId: string, raw: string | undefined): string | null {
  const prefix = `orgs/${orgId}/`;
  const path = String(raw ?? "").trim();
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  if (rest.length === 0 || rest.includes("/")) return null;
  return path;
}

async function storageObjectExists(supabase: SupabaseClient, path: string): Promise<boolean> {
  const idx = path.lastIndexOf("/");
  const folder = path.slice(0, idx);
  const name = path.slice(idx + 1);
  const { data } = await supabase.storage.from("resources").list(folder, {
    limit: 1000,
    search: name,
  });
  return (data ?? []).some((o) => o.name === name);
}

/** Owner/admin-only: create a resource from an already-uploaded file (PRD §30). */
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

  const filePath = parseOwnedPath(ctx.org.id, String(formData.get("file_path") ?? ""));
  if (!filePath) return { error: "Upload didn't finish — please choose the file again." };

  const fileSize = Number(formData.get("file_size") ?? 0);
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    return { error: "Files must be smaller than 50 MB." };
  }

  const thumbnailRaw = String(formData.get("thumbnail_path") ?? "").trim();
  const thumbnailPath = thumbnailRaw ? parseOwnedPath(ctx.org.id, thumbnailRaw) : null;
  if (thumbnailRaw && !thumbnailPath) {
    return { error: "Upload didn't finish — please choose the file again." };
  }

  const supabase = await createClient();
  if (!(await storageObjectExists(supabase, filePath))) {
    return { error: "Upload didn't finish — please choose the file again." };
  }
  if (thumbnailPath && !(await storageObjectExists(supabase, thumbnailPath))) {
    return { error: "Upload didn't finish — please choose the file again." };
  }

  const uploadedPaths = [filePath, ...(thumbnailPath ? [thumbnailPath] : [])];

  const { error } = await supabase.from("resources").insert({
    organization_id: ctx.org.id,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    file_path: filePath,
    file_name: String(formData.get("file_name") ?? "").trim() || "download",
    mime_type: String(formData.get("file_type") ?? "").trim() || null,
    file_size: fileSize,
    thumbnail_path: thumbnailPath,
    visibility: formData.get("visibility") === "private" ? "private" : "public",
    published: formData.get("published") === "1",
    gated: formData.get("gated") === "1",
  });

  if (error) {
    await supabase.storage.from("resources").remove(uploadedPaths);
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
  if (!current) return { error: "Resource not found." };

  const patch: Record<string, unknown> = {
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    visibility: formData.get("visibility") === "private" ? "private" : "public",
    published: formData.get("published") === "1",
    gated: formData.get("gated") === "1",
  };

  let newFilePath: string | null = null;
  let newThumbPath: string | null = null;

  const newFileRaw = String(formData.get("file_path") ?? "").trim();
  if (newFileRaw) {
    const parsed = parseOwnedPath(ctx.org.id, newFileRaw);
    if (!parsed) return { error: "Upload didn't finish — please choose the file again." };
    if (parsed !== current.file_path) {
      const fileSize = Number(formData.get("file_size") ?? 0);
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
        return { error: "Files must be smaller than 50 MB." };
      }
      if (!(await storageObjectExists(supabase, parsed))) {
        return { error: "Upload didn't finish — please choose the file again." };
      }
      newFilePath = parsed;
      patch.file_path = newFilePath;
      patch.file_name = String(formData.get("file_name") ?? "").trim() || "download";
      patch.mime_type = String(formData.get("file_type") ?? "").trim() || null;
      patch.file_size = fileSize;
    }
  }

  const newThumbRaw = String(formData.get("thumbnail_path") ?? "").trim();
  if (newThumbRaw) {
    const parsed = parseOwnedPath(ctx.org.id, newThumbRaw);
    if (parsed && parsed !== current.thumbnail_path) {
      if (!(await storageObjectExists(supabase, parsed))) {
        return { error: "Upload didn't finish — please choose the file again." };
      }
      newThumbPath = parsed;
      patch.thumbnail_path = newThumbPath;
    }
  }

  const { error } = await supabase
    .from("resources")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", ctx.org.id);

  if (error) {
    const toRemove = [newFilePath, newThumbPath].filter((p): p is string => Boolean(p));
    if (toRemove.length > 0) await supabase.storage.from("resources").remove(toRemove);
    return { error: friendlyDbError(error.message) };
  }

  // Clean up replaced objects
  const toRemove: string[] = [];
  if (newFilePath && current.file_path && current.file_path !== newFilePath) {
    toRemove.push(current.file_path);
  }
  if (newThumbPath && current.thumbnail_path && current.thumbnail_path !== newThumbPath) {
    toRemove.push(current.thumbnail_path);
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
