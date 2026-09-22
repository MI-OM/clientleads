"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { archiveContactAction, deleteContactAction, restoreContactAction } from "@/lib/crm/actions";
import { Button } from "@/components/ui/button";

export function ContactActions({
  contactId,
  archived,
  canDelete,
}: {
  contactId: string;
  archived: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ error?: string }>({});

  const run = async (action: () => Promise<{ error?: string }>, then?: () => void) => {
    setFeedback({});
    const result = await action();
    if (result?.error) setFeedback(result);
    else {
      then?.();
      startTransition(() => router.refresh());
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {archived ? (
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          onClick={() => run(() => restoreContactAction(contactId))}
        >
          <RotateCcw className="size-4" aria-hidden /> Restore
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          onClick={() => run(() => archiveContactAction(contactId))}
        >
          <Archive className="size-4" aria-hidden /> Archive
        </Button>
      )}
      {canDelete ? (
        <Button
          variant="destructive"
          size="sm"
          loading={pending}
          onClick={() => {
            if (!window.confirm("Permanently delete this contact? This cannot be undone.")) return;
            run(
              () => deleteContactAction(contactId),
              () => router.push("/dashboard/contacts"),
            );
          }}
        >
          <Trash2 className="size-4" aria-hidden /> Delete
        </Button>
      ) : null}
      {feedback.error ? <p className="text-sm text-destructive">{feedback.error}</p> : null}
    </div>
  );
}
