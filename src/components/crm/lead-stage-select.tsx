"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLeadStageAction } from "@/lib/crm/actions";
import { LEAD_STAGES } from "@/lib/crm/constants";
import { Select } from "@/components/ui/select";

/** Stage dropdown used on the lead detail page. */
export function LeadStageSelect({ leadId, stage }: { leadId: string; stage: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      className="h-10 w-40"
      value={stage}
      disabled={pending}
      onChange={async (e) => {
        const next = e.target.value;
        if (next === stage) return;
        const result = await updateLeadStageAction(leadId, next);
        if (!result?.error) startTransition(() => router.refresh());
      }}
      aria-label="Lead stage"
    >
      {LEAD_STAGES.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Select>
  );
}
