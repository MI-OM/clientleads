"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createTagAction, deleteTagAction } from "@/lib/crm/actions";
import type { CrmState } from "@/lib/crm/actions";
import type { Tag } from "@/lib/crm/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Workspace tag list + create/delete (tag CRUD, PRD §11). */
export function TagsManager({ tags, canManage }: { tags: Tag[]; canManage: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CrmState, FormData>(createTagAction, {});

  return (
    <div className="flex flex-col gap-3">
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium"
            >
              {tag.name}
              <span className="text-muted-foreground">{tag.contactCount}</span>
              {canManage ? (
                <button
                  type="button"
                  onClick={async () => {
                    await deleteTagAction(tag.id);
                    router.refresh();
                  }}
                  className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label={`Delete ${tag.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No tags yet. Create one below.</p>
      )}

      {canManage ? (
        <form action={formAction} className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="new-tag" className="text-xs">
              New tag
            </Label>
            <Input id="new-tag" name="name" placeholder="e.g. Buyer, Halifax…" className="h-9" />
          </div>
          <Button type="submit" size="sm" variant="outline" loading={pending}>
            Add tag
          </Button>
        </form>
      ) : null}
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : state?.success ? (
        <p role="status" className="text-sm text-primary">
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
