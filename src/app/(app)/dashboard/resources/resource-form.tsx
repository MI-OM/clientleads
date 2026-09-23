"use client";

import { useActionState } from "react";
import { FileUp } from "lucide-react";
import { createResourceAction, updateResourceAction, type ResourceActionState } from "./actions";
import type { Resource } from "@/lib/resources/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

interface ResourceFormProps {
  resource?: Resource;
}

export function ResourceForm({ resource }: ResourceFormProps) {
  const [state, formAction, pending] = useActionState<ResourceActionState, FormData>(
    resource ? updateResourceAction : createResourceAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {resource ? <input type="hidden" name="id" value={resource.id} /> : null}

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
              <Input id="file" name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip,.txt,.csv" />
              {resource ? (
                <p className="text-xs text-muted-foreground">
                  Current: {resource.fileName} ({formatSize(resource.fileSize)})
                </p>
              ) : null}
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
              Gated downloads capture a contact and create a lead automatically. <FileUp className="inline size-3.5" aria-hidden />
            </p>
          </div>
        </CardContent>
      </Card>

      <FormStatus state={state} />
      <div>
        <Button type="submit" loading={pending}>
          {resource ? "Save changes" : "Upload resource"}
        </Button>
      </div>
    </form>
  );
}