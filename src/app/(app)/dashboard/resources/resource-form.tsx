"use client";

import { useActionState, useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { createResourceAction, updateResourceAction, type ResourceActionState } from "./actions";
import { createClient } from "@/lib/supabase/client";
import type { Resource } from "@/lib/resources/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // bucket limit (50 MB)

function FormStatus({ state }: { state: ResourceActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function uploadErrorMessage(message: string): string {
  if (/row-level security|permission/i.test(message)) {
    return "Your account isn't allowed to upload files to this workspace.";
  }
  if (/size|too large|storage/i.test(message)) {
    return "The file is too large — keep it under 50 MB.";
  }
  return "The file upload failed. Please try again.";
}

interface ResourceFormProps {
  resource?: Resource;
  /** Workspace id — prefixes storage object paths with `orgs/<orgId>/` so the
   *  private bucket's RLS policies (owner/admin only) govern every upload. */
  orgId: string;
}

export function ResourceForm({ resource, orgId }: ResourceFormProps) {
  const [state, formAction, pending] = useActionState<ResourceActionState, FormData>(
    resource ? updateResourceAction : createResourceAction,
    {},
  );

  const formRef = useRef<HTMLFormElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Metadata of the object already uploaded directly to Supabase Storage.
  // Included as hidden inputs so the server action only records the row.
  const [uploaded, setUploaded] = useState<{
    filePath: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  } | null>(null);

  async function uploadToStorage(file: File) {
    const supabase = createClient();
    const filePath = `orgs/${orgId}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const { error } = await supabase.storage.from("resources").upload(filePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw new Error(uploadErrorMessage(error.message));
    return {
      filePath,
      fileName: file.name.trim() || "download",
      mimeType: file.type || "",
      fileSize: file.size,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (uploading) {
      event.preventDefault();
      return;
    }
    // No pending file — let the server action run.
    if (!selectedFile) return;

    event.preventDefault();

    if (selectedFile.size === 0) {
      setUploadError("Choose a file to upload.");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setUploadError("Files must be smaller than 50 MB.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadToStorage(selectedFile);
      setUploaded(result);
      setSelectedFile(null);
      // Re-submit now that the file metadata is in hidden fields.
      formRef.current?.requestSubmit();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "The file upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const fileStatus =
    uploaded ? (
      <p className="text-xs text-muted-foreground">
        Ready: {uploaded.fileName} ({formatSize(uploaded.fileSize)})
      </p>
    ) : selectedFile ? (
      <p className="text-xs text-muted-foreground">
        New file: {selectedFile.name} ({formatSize(selectedFile.size)}) — uploading when you save
      </p>
    ) : resource ? (
      <p className="text-xs text-muted-foreground">
        Current: {resource.fileName} ({formatSize(resource.fileSize)})
      </p>
    ) : null;

  return (
    <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-6">
      {resource ? <input type="hidden" name="id" value={resource.id} /> : null}

      {uploaded ? (
        <>
          <input type="hidden" name="file_path" value={uploaded.filePath} />
          <input type="hidden" name="file_name" value={uploaded.fileName} />
          <input type="hidden" name="file_type" value={uploaded.mimeType} />
          <input type="hidden" name="file_size" value={String(uploaded.fileSize)} />
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Resource details</CardTitle>
          <CardDescription>
            Files visitors can download from your public page. Public resources are listed;
            private ones stay internal (PRD §30).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                defaultValue={resource?.title ?? ""}
                placeholder="e.g. First-time buyer guide"
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={resource?.description ?? ""}
                placeholder="What's inside this file?"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="visibility">Visibility</Label>
              <Select id="visibility" name="visibility" defaultValue={resource?.visibility ?? "public"}>
                <option value="public">Public — shown on my page</option>
                <option value="private">Private — dashboard only</option>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="file">File{resource ? " (optional — replaces current)" : ""}</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip,.txt,.csv"
                onChange={(event) => {
                  setUploaded(null);
                  setUploadError(null);
                  setSelectedFile(event.target.files?.[0] ?? null);
                }}
              />
              {fileStatus}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="published"
                  value="1"
                  defaultChecked={resource?.published ?? true}
                  className="size-4 rounded border-input accent-[var(--primary)]"
                />
                Published — visible to visitors
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="gated"
                  value="1"
                  defaultChecked={resource?.gated ?? false}
                  className="size-4 rounded border-input accent-[var(--primary)]"
                />
                Gated — ask for name &amp; email before download
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Gated downloads capture a contact and create a lead automatically.{" "}
              <FileUp className="inline size-3.5" aria-hidden />
            </p>
          </div>
        </CardContent>
      </Card>

      <FormStatus state={state} />
      {(uploadError || uploading) && (
        <p role={uploadError ? "alert" : "status"} className="flex items-center gap-2 text-sm text-muted-foreground">
          {uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          <span className={uploadError ? "text-destructive" : undefined}>{uploadError ?? "Uploading file…"}</span>
        </p>
      )}
      <div>
        <Button type="submit" loading={pending || uploading}>
          {resource ? "Save changes" : "Upload resource"}
        </Button>
      </div>
    </form>
  );
}