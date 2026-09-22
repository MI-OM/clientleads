"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { addTagToContactAction, removeTagFromContactAction } from "@/lib/crm/actions";
import type { Tag } from "@/lib/crm/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

/** Current tags + add/remove controls for a contact. */
export function ContactTags({
  contactId,
  tags,
  allTags,
  canEdit,
}: {
  contactId: string;
  /** Names currently attached to the contact. */
  tags: string[];
  allTags: Tag[];
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedTagId, setSelectedTagId] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string }>({});

  const available = allTags.filter((t) => !tags.includes(t.name));

  const run = async (action: () => Promise<{ error?: string }>) => {
    setFeedback({});
    const result = await action();
    if (result?.error) setFeedback(result);
    else {
      startTransition(() => router.refresh());
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 ? (
          <span className="text-sm text-muted-foreground">No tags yet</span>
        ) : (
          tags.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1 pr-1">
              {name}
              {canEdit ? (
                <button
                  type="button"
                  onClick={() =>
                    run(() => {
                      const tag = allTags.find((t) => t.name === name);
                      return tag
                        ? removeTagFromContactAction(contactId, tag.id)
                        : Promise.resolve({});
                    })
                  }
                  disabled={pending}
                  className="grid size-4 place-items-center rounded-full hover:bg-muted disabled:opacity-50"
                  aria-label={`Remove ${name} tag`}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </Badge>
          ))
        )}
      </div>
      {canEdit && available.length > 0 ? (
        <div className="flex items-center gap-2">
          <Select
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
            aria-label="Tag to add"
            className="h-9 w-auto min-w-44"
          >
            <option value="">Add tag…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedTagId || pending}
            onClick={() => {
              if (!selectedTagId) return;
              run(() => addTagToContactAction(contactId, selectedTagId));
              setSelectedTagId("");
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
      {feedback.error ? <p className="text-sm text-destructive">{feedback.error}</p> : null}
    </div>
  );
}
