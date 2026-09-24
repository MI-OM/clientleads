"use client";

import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, Power, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTOMATION_STEP_LABELS, AUTOMATION_TRIGGER_LABELS } from "@/lib/automations/types";
import type { Automation, AutomationConditions, AutomationStep } from "@/lib/automations/types";
import { toggleAutomationAction } from "./actions";
import { AutomationConfigForm } from "./automation-config-form";
import type { AutomationFormOptions } from "./automation-config-form";

interface AutomationCardProps {
  automation: Automation;
  trigger: Automation["triggerType"];
  description: string;
  options: AutomationFormOptions;
}

/** Friendly labels for notification kinds (raw snake_case stored in config). */
const NOTIFY_LABELS: Record<string, string> = {
  new_lead: "New lead",
  form_submission: "Form submission",
  appointment_created: "Appointment created",
  appointment_cancelled: "Appointment cancelled",
  appointment_rescheduled: "Appointment rescheduled",
};

/** One-line human summary of a step, for the collapsed card view. */
function stepDetail(step: AutomationStep, options: AutomationFormOptions): string {
  switch (step.type) {
    case "create_task": {
      const title = step.title?.trim();
      const due = step.due_in_days ?? 0;
      const when = due > 0 ? `in ${due} day${due === 1 ? "" : "s"}` : "today";
      return title ? `${title} (${when})` : `Follow-up task (${when})`;
    }
    case "add_tags":
      return step.tags?.length ? step.tags.map((t) => `#${t}`).join(" ") : "Add tags";
    case "add_activity":
      return step.subject?.trim() ? `Log "${step.subject.trim()}"` : "Log an activity";
    case "update_lead_stage":
      return step.stage ? `Move linked lead to ${step.stage}` : "Move linked lead to a stage";
    case "send_email": {
      const template = step.template_id
        ? options.templates.find((t) => t.id === step.template_id)
        : null;
      const delay = (step.delay_hours ?? 0) > 0 ? ` after ${step.delay_hours}h` : "";
      return template ? `Send "${template.name}"${delay}` : `Send template email${delay}`;
    }
    case "notify":
      return `Notify business (${NOTIFY_LABELS[step.kind ?? "new_lead"] ?? "New lead"})`;
  }
}

/** Non-default conditions, for the collapsed card view. */
function conditionItems(
  conditions: AutomationConditions,
  options: AutomationFormOptions,
): string[] {
  const items: string[] = [];
  if (conditions.only_new_contacts) items.push("Only new contacts");
  if (conditions.skip_unsubscribed === false) items.push("Include unsubscribed");
  const form = conditions.scope_form_id
    ? options.forms.find((f) => f.id === conditions.scope_form_id)
    : null;
  if (form) items.push(`Form: ${form.name}`);
  const service = conditions.scope_service_id
    ? options.services.find((s) => s.id === conditions.scope_service_id)
    : null;
  if (service) items.push(`Service: ${service.name}`);
  const resource = conditions.scope_resource_id
    ? options.resources.find((r) => r.id === conditions.scope_resource_id)
    : null;
  if (resource) items.push(`Resource: ${resource.name}`);
  if (conditions.lead_stage) items.push(`Lead moves to ${conditions.lead_stage}`);
  return items;
}

/**
 * One automations card. The workflow editor is collapsed to a summary by
 * default so the page stays a single screen tall and scrolls like every
 * other dashboard page; "Edit workflow" expands the full editor.
 */
export function AutomationCard({ automation, trigger, description, options }: AutomationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const triggerLabel = AUTOMATION_TRIGGER_LABELS[trigger];
  const steps = automation.actionConfig.steps;
  const conditions = automation.actionConfig.conditions;
  const conditionsShown = conditionItems(conditions, options);

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Bot className="mt-0.5 size-5 text-primary" aria-hidden />
            <div>
              <CardTitle className="text-base">{automation.name ?? triggerLabel}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Badge variant={automation.active ? "success" : "secondary"}>
            {automation.active ? "On" : "Off"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Trigger: <code className="font-mono">{triggerLabel}</code>
          </p>
          <div className="flex items-center gap-2">
            <form action={toggleAutomationAction}>
              <input type="hidden" name="id" value={automation.id} />
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-medium shadow-sm hover:bg-accent"
              >
                {automation.active ? (
                  <>
                    <PowerOff className="size-4" aria-hidden /> Turn off
                  </>
                ) : (
                  <>
                    <Power className="size-4" aria-hidden /> Turn on
                  </>
                )}
              </button>
            </form>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>
                  <ChevronDown className="size-4" aria-hidden /> Done
                </>
              ) : (
                <>
                  <ChevronRight className="size-4" aria-hidden /> Edit workflow
                </>
              )}
            </Button>
          </div>
        </div>

        {expanded ? (
          <AutomationConfigForm automation={automation} trigger={trigger} options={options} />
        ) : (
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="grid gap-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Actions
              </p>
              {steps.length === 0 ? (
                <p className="text-muted-foreground">
                  No actions configured — open the workflow editor to add steps.
                </p>
              ) : (
                steps.map((step, i) => (
                  <p key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{AUTOMATION_STEP_LABELS[step.type]}</span>
                    <span className="text-muted-foreground">{stepDetail(step, options)}</span>
                  </p>
                ))
              )}
            </div>
            {conditionsShown.length > 0 ? (
              <div className="grid gap-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Conditions
                </p>
                {conditionsShown.map((c) => (
                  <p key={c} className="text-muted-foreground">
                    {c}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
