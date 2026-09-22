"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteLeadAction } from "@/lib/crm/actions";
import { Button } from "@/components/ui/button";

export function LeadActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="destructive"
        size="sm"
        loading={pending}
        onClick={async () => {
          if (!window.confirm("Delete this lead? The activity history is kept.")) return;
          setFeedback(null);
          const result = await deleteLeadAction(leadId);
          if (result?.error) setFeedback(result.error);
          else {
            startTransition(() => router.push("/dashboard/leads"));
          }
        }}
      >
        <Trash2 className="size-4" aria-hidden /> Delete
      </Button>
      {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
    </div>
  );
}
