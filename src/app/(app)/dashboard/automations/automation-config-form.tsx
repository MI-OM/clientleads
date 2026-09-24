"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { updateAutomationAction } from "./actions";
import type { AutomationActionState } from "./actions";
import type { Automation } from "@/lib/automations/types";
import {
  AUTOMATION_STEP_LABELS,
  AUTOMATION_STEP_TYPES,
  AUTOMATION_STEP_TYPES_BY_TRIGGER,
  NOTIFY_KINDS,
  EMPTY_CONDITIONS,
} from "@/lib/automations/types";
import type {
  AutomationConditions,
  AutomationStep,
  AutomationStepType,
  CreateTaskStep,
  NotifyKind,
} from "@/lib/automations/types";
import { LEAD_STAGES } from "@/lib/crm/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/** Plain option lists loaded server-side for pickers. */
export interface AutomationFormOptions {
  forms: { id: string; name: string }[];
  services: { id: string; name: string }[];
  resources: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  members: { id: string; name: string }[];
}

interface AutomationConfigFormProps {
  automation: Automation;
  trigger: Automation["triggerType"];
  options: AutomationFormOptions;
}

const SCOPE_FIELDS: Partial<Record<Automation["triggerType"], keyof AutomationConditions>> = {
  form_submitted: "scope_form_id",
  appointment_booked: "scope_service_id",
  appointment_completed: "scope_service_id",
  appointment_cancelled: "scope_service_id",
  appointment_no_show: "scope_service_id",
  resource_downloaded: "scope_resource_id",
};

const PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
const ACTIVITY_TYPES = ["automation", "call", "email", "note", "meeting", "other"];

/** Per-automation workflow editor (steps + conditions, M6.5). */
export function AutomationConfigForm({ automation, trigger, options }: AutomationConfigFormProps) {
  const [state, formAction, pending] = useActionState<AutomationActionState, FormData>(
    updateAutomationAction,
    {},
  );

  const initial = automation.actionConfig;
  const [steps, setSteps] = useState<AutomationStep[]>(
    initial.steps.length > 0 ? initial.steps : [{ type: "create_task", due_in_days: 3 }],
  );
  const [conditions, setConditions] = useState<AutomationConditions>({
    ...EMPTY_CONDITIONS,
    ...(initial.conditions ?? {}),
  });

  const allowed = AUTOMATION_STEP_TYPES_BY_TRIGGER[trigger] ?? AUTOMATION_STEP_TYPES;
  const scopeKey = SCOPE_FIELDS[trigger];

  function patchStep(index: number, patch: Partial<AutomationStep>) {
    setSteps((list) =>
      list.map((s, i) => (i === index ? ({ ...s, ...patch } as AutomationStep) : s)),
    );
  }

  function addStep() {
    setSteps((list) => [...list, { type: allowed[0], due_in_days: 3 }]);
  }

  function removeStep(index: number) {
    setSteps((list) => list.filter((_, i) => i !== index));
  }

  function patchConditions(patch: Partial<AutomationConditions>) {
    setConditions((c) => ({ ...c, ...patch }));
  }

  const config = JSON.stringify({ steps, conditions });

  return (
    <Card className="overflow-hidden">
      <form action={formAction} className="flex flex-col gap-4 p-4">
        <input type="hidden" name="id" value={automation.id} />
        <input type="hidden" name="config" value={config} />

        <CardHeader className="p-0">
          <CardTitle className="text-sm">Workflow</CardTitle>
        </CardHeader>

        {/* ── steps ─────────────────────────────────────────────────── */}
        <CardContent className="grid gap-3 p-0">
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No actions yet — add a step below. Running an automation with no steps does nothing.
            </p>
          ) : (
            steps.map((step, i) => (
              <div key={i} className="grid gap-3 rounded-lg border p-3">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-1">
                    <Label htmlFor={`step-type-${automation.id}-${i}`}>Step type</Label>
                    <Select
                      id={`step-type-${automation.id}-${i}`}
                      value={step.type}
                      onChange={(e) => {
                        const next = e.target.value as AutomationStepType;
                        setSteps((list) =>
                          list.map((s, idx) =>
                            idx === i ? ({ type: next } as AutomationStep) : s,
                          ),
                        );
                      }}
                    >
                      {allowed.map((t) => (
                        <option key={t} value={t}>
                          {AUTOMATION_STEP_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-end justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(i)}>
                      <Trash2 className="size-4" aria-hidden />
                      <span className="sr-only">Remove step</span>
                    </Button>
                  </div>
                </div>

                {step.type === "create_task" && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="grid gap-1.5 sm:col-span-1">
                      <Label htmlFor={`task-title-${automation.id}-${i}`}>
                        Title{" "}
                        <span className="font-normal text-muted-foreground">
                          (default if empty)
                        </span>
                      </Label>
                      <Input
                        id={`task-title-${automation.id}-${i}`}
                        value={(step as { title?: string }).title ?? ""}
                        maxLength={200}
                        placeholder="e.g. Call the new prospect"
                        onChange={(e) => patchStep(i, { title: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`task-due-${automation.id}-${i}`}>Due in (days)</Label>
                      <Input
                        id={`task-due-${automation.id}-${i}`}
                        type="number"
                        min={0}
                        max={365}
                        step={1}
                        value={String((step as { due_in_days?: number }).due_in_days ?? 0)}
                        onChange={(e) => patchStep(i, { due_in_days: Number(e.target.value) })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`task-priority-${automation.id}-${i}`}>Priority</Label>
                      <Select
                        id={`task-priority-${automation.id}-${i}`}
                        value={(step as { priority?: string }).priority ?? "Normal"}
                        onChange={(e) =>
                          patchStep(i, { priority: e.target.value as CreateTaskStep["priority"] })
                        }
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )}

                {step.type === "add_tags" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`tags-${automation.id}-${i}`}>
                      Tags{" "}
                      <span className="font-normal text-muted-foreground">
                        (comma separated — created if missing)
                      </span>
                    </Label>
                    <Input
                      id={`tags-${automation.id}-${i}`}
                      list={`tags-options-${automation.id}`}
                      value={(step as { tags?: string[] }).tags?.join(", ") ?? ""}
                      placeholder="New, Follow-up"
                      onChange={(e) =>
                        patchStep(i, {
                          tags: e.target.value
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                    <datalist id={`tags-options-${automation.id}`}>
                      {options.tags.map((t) => (
                        <option key={t.id} value={t.name} />
                      ))}
                    </datalist>
                  </div>
                )}

                {step.type === "add_activity" && (
                  <div className="grid gap-3">
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`activity-type-${automation.id}-${i}`}>Activity type</Label>
                        <Select
                          id={`activity-type-${automation.id}-${i}`}
                          value={(step as { activity_type?: string }).activity_type ?? "automation"}
                          onChange={(e) => patchStep(i, { activity_type: e.target.value })}
                        >
                          {ACTIVITY_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`activity-subject-${automation.id}-${i}`}>Subject</Label>
                        <Input
                          id={`activity-subject-${automation.id}-${i}`}
                          value={(step as { subject?: string }).subject ?? ""}
                          maxLength={200}
                          onChange={(e) => patchStep(i, { subject: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`activity-desc-${automation.id}-${i}`}>Description</Label>
                      <Input
                        id={`activity-desc-${automation.id}-${i}`}
                        value={(step as { description?: string }).description ?? ""}
                        maxLength={2000}
                        onChange={(e) => patchStep(i, { description: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {step.type === "update_lead_stage" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`stage-${automation.id}-${i}`}>Move linked lead to</Label>
                    <Select
                      id={`stage-${automation.id}-${i}`}
                      value={(step as { stage?: string }).stage ?? ""}
                      onChange={(e) => patchStep(i, { stage: e.target.value })}
                    >
                      <option value="">— pick a stage —</option>
                      {LEAD_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {step.type === "send_email" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`template-${automation.id}-${i}`}>Email template</Label>
                      <Select
                        id={`template-${automation.id}-${i}`}
                        value={(step as { template_id?: string | null }).template_id ?? ""}
                        onChange={(e) => patchStep(i, { template_id: e.target.value || null })}
                      >
                        <option value="">— pick a template —</option>
                        {options.templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`delay-${automation.id}-${i}`}>Send after (hours)</Label>
                      <Input
                        id={`delay-${automation.id}-${i}`}
                        type="number"
                        min={0}
                        max={8760}
                        step={1}
                        value={String((step as { delay_hours?: number }).delay_hours ?? 0)}
                        onChange={(e) => patchStep(i, { delay_hours: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                )}

                {step.type === "notify" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`notify-kind-${automation.id}-${i}`}>Notification kind</Label>
                    <Select
                      id={`notify-kind-${automation.id}-${i}`}
                      value={(step as { kind?: string }).kind ?? "new_lead"}
                      onChange={(e) => patchStep(i, { kind: e.target.value as NotifyKind })}
                    >
                      {NOTIFY_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            ))
          )}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={addStep}>
              <Plus className="size-4" aria-hidden />
              Add step
            </Button>
          </div>
        </CardContent>

        {/* ── conditions ────────────────────────────────────────────── */}
        <CardHeader className="p-0">
          <CardTitle className="text-sm">Conditions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-0 sm:grid-cols-2">
          <div className="flex items-start justify-between gap-2 rounded-lg border p-3">
            <div className="grid gap-1">
              <Label htmlFor={`only-new-${automation.id}`}>Only new contacts</Label>
              <p className="text-xs text-muted-foreground">
                Fire only when the contact was created moments before the event.
              </p>
            </div>
            <input
              id={`only-new-${automation.id}`}
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={conditions.only_new_contacts === true}
              onChange={(e) => patchConditions({ only_new_contacts: e.target.checked })}
            />
          </div>
          <div className="flex items-start justify-between gap-2 rounded-lg border p-3">
            <div className="grid gap-1">
              <Label htmlFor={`skip-unsub-${automation.id}`}>Skip unsubscribed</Label>
              <p className="text-xs text-muted-foreground">
                Never email contacts who opted out (emails only).
              </p>
            </div>
            <input
              id={`skip-unsub-${automation.id}`}
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={conditions.skip_unsubscribed !== false}
              onChange={(e) => patchConditions({ skip_unsubscribed: e.target.checked })}
            />
          </div>

          {scopeKey === "scope_form_id" && (
            <div className="grid gap-1.5">
              <Label htmlFor={`scope-form-${automation.id}`}>Only for form</Label>
              <Select
                id={`scope-form-${automation.id}`}
                value={conditions.scope_form_id ?? ""}
                onChange={(e) => patchConditions({ scope_form_id: e.target.value || null })}
              >
                <option value="">Any form</option>
                {options.forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {scopeKey === "scope_service_id" && (
            <div className="grid gap-1.5">
              <Label htmlFor={`scope-service-${automation.id}`}>Only for service</Label>
              <Select
                id={`scope-service-${automation.id}`}
                value={conditions.scope_service_id ?? ""}
                onChange={(e) => patchConditions({ scope_service_id: e.target.value || null })}
              >
                <option value="">Any service</option>
                {options.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {scopeKey === "scope_resource_id" && (
            <div className="grid gap-1.5">
              <Label htmlFor={`scope-resource-${automation.id}`}>Only for resource</Label>
              <Select
                id={`scope-resource-${automation.id}`}
                value={conditions.scope_resource_id ?? ""}
                onChange={(e) => patchConditions({ scope_resource_id: e.target.value || null })}
              >
                <option value="">Any resource</option>
                {options.resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {trigger === "lead_stage_changed" && (
            <div className="grid gap-1.5">
              <Label htmlFor={`lead-stage-${automation.id}`}>When a lead moves to</Label>
              <Select
                id={`lead-stage-${automation.id}`}
                value={conditions.lead_stage ?? ""}
                onChange={(e) => patchConditions({ lead_stage: e.target.value || null })}
              >
                <option value="">Any stage change</option>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </CardContent>

        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <div>
          <Button type="submit" size="sm" loading={pending}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}
