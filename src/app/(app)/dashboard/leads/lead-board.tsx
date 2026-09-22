"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateLeadStageAction } from "@/lib/crm/actions";
import { LEAD_STAGES } from "@/lib/crm/constants";
import type { Lead } from "@/lib/crm/types";
import { formatRelative, money } from "@/lib/crm/format";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function StageDot({ stage }: { stage: string }) {
  const dotByStage: Record<string, string> = {
    Won: "bg-green-500",
    Lost: "bg-red-400",
    Appointment: "bg-blue-500",
    Active: "bg-amber-500",
    Qualified: "bg-emerald-500",
    Contacted: "bg-indigo-400",
    New: "bg-slate-400",
  };
  return (
    <span className={cn("size-2 rounded-full", dotByStage[stage] ?? "bg-slate-400")} aria-hidden />
  );
}

/** Kanban-style pipeline board (PRD §14). Cards move stages via the select. */
export function LeadBoard({ leadsByStage }: { leadsByStage: Record<string, Lead[]> }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const move = async (lead: Lead, stage: string) => {
    if (stage === lead.stage) return;
    setError(null);
    setPendingId(lead.id);
    const result = await updateLeadStageAction(lead.id, stage);
    setPendingId(null);
    if (result?.error) setError(result.error);
    else startTransition(() => router.refresh());
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {LEAD_STAGES.map((stage) => {
          const leads = leadsByStage[stage] ?? [];
          return (
            <div key={stage} className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-2">
              <div className="flex items-center gap-2 px-1">
                <StageDot stage={stage} />
                <p className="text-sm font-medium">{stage}</p>
                <span className="ml-auto text-xs text-muted-foreground">{leads.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {leads.map((lead) => (
                  <div key={lead.id} className="rounded-md border bg-card p-3 shadow-sm">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {lead.contactName ?? "No contact"}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{money(lead.expectedValue)}</span>
                      <Badge
                        variant={
                          lead.priority === "High"
                            ? "warning"
                            : lead.priority === "Low"
                              ? "outline"
                              : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {lead.priority}
                      </Badge>
                    </div>
                    {lead.nextFollowUpAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        F/u {formatRelative(lead.nextFollowUpAt)}
                      </p>
                    ) : null}
                    <Select
                      className="mt-2 h-8 text-xs"
                      value={lead.stage}
                      disabled={pendingId === lead.id}
                      onChange={(e) => move(lead, e.target.value)}
                      aria-label={`Move ${lead.contactName ?? "lead"} to stage`}
                    >
                      {LEAD_STAGES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
                {leads.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Empty
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground" role={error ? "alert" : undefined}>
        {error ??
          `${Object.values(leadsByStage).reduce((n, l) => n + l.length, 0)} open leads across ${LEAD_STAGES.length} stages`}
      </p>
    </div>
  );
}
