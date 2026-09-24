/**
 * M6.5 advanced-automation domain types (PRD §32 — controlled workflows).
 *
 * action_config is now step-based:
 *   {
 *     "steps": [
 *       {"type":"create_task", "title":"...", "due_in_days":3, "priority":"Normal"},
 *       {"type":"add_tags", "tags":["New"]},
 *       {"type":"send_email", "template_id":"...", "delay_hours":24}
 *     ],
 *     "conditions": {
 *       "scope_form_id": null, "scope_service_id": null, "scope_resource_id": null,
 *       "only_new_contacts": false, "skip_unsubscribed": true, "lead_stage": null
 *     }
 *   }
 *
 * Legacy 0007 flat configs {"create_follow_up_task":true,"due_in_days":3,"notify":true}
 * are normalized on read → identical behaviour (one synchronous task).
 */

export type AutomationTrigger =
  | "appointment_booked"
  | "form_submitted"
  | "appointment_completed"
  | "resource_downloaded"
  | "contact_created"
  | "lead_stage_changed"
  | "appointment_cancelled"
  | "appointment_no_show"
  | "appointment_reminder";

export const AUTOMATION_TRIGGERS: AutomationTrigger[] = [
  "appointment_booked",
  "form_submitted",
  "appointment_completed",
  "resource_downloaded",
  "contact_created",
  "lead_stage_changed",
  "appointment_cancelled",
  "appointment_no_show",
  "appointment_reminder",
];

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  appointment_booked: "Appointment booked",
  form_submitted: "Form submitted",
  appointment_completed: "Appointment completed",
  resource_downloaded: "Resource downloaded",
  contact_created: "Contact created",
  lead_stage_changed: "Lead stage changed",
  appointment_cancelled: "Appointment cancelled",
  appointment_no_show: "Appointment no-show",
  appointment_reminder: "Appointment reminder",
};

/** Step types the engine can execute (see migration 00015 for semantics). */
export type AutomationStepType =
  "create_task" | "add_tags" | "add_activity" | "update_lead_stage" | "send_email" | "notify";

export const AUTOMATION_STEP_TYPES: AutomationStepType[] = [
  "create_task",
  "add_tags",
  "add_activity",
  "update_lead_stage",
  "send_email",
  "notify",
];

export const AUTOMATION_STEP_LABELS: Record<AutomationStepType, string> = {
  create_task: "Create follow-up task",
  add_tags: "Add tags to contact",
  add_activity: "Log activity",
  update_lead_stage: "Update lead stage",
  send_email: "Send template email",
  notify: "Notify the business",
};

/** Which steps make sense for which trigger (drives the admin UI). */
export const AUTOMATION_STEP_TYPES_BY_TRIGGER: Record<AutomationTrigger, AutomationStepType[]> = {
  appointment_booked: [
    "create_task",
    "add_tags",
    "add_activity",
    "update_lead_stage",
    "send_email",
    "notify",
  ],
  form_submitted: ["create_task", "add_activity", "notify"],
  appointment_completed: ["create_task", "add_tags", "add_activity", "send_email", "notify"],
  resource_downloaded: ["create_task", "add_activity", "notify"],
  contact_created: ["create_task", "add_tags", "add_activity", "send_email", "notify"],
  lead_stage_changed: ["create_task", "add_tags", "add_activity", "send_email", "notify"],
  appointment_cancelled: ["create_task", "add_activity", "send_email", "notify"],
  appointment_no_show: ["create_task", "add_activity", "send_email", "notify"],
  appointment_reminder: ["send_email", "notify"],
};

/** @deprecated use AUTOMATION_STEP_TYPES_BY_TRIGGER */
export const STEPS_BY_TRIGGER = AUTOMATION_STEP_TYPES_BY_TRIGGER;

/** Notify kinds map to the notify.ts kinds (email module). */
export const NOTIFY_KINDS = [
  "new_lead",
  "form_submission",
  "appointment_created",
  "appointment_cancelled",
  "appointment_rescheduled",
] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type AutomationRecipient = "customer" | "business" | "selected_members";
export const AUTOMATION_RECIPIENTS: AutomationRecipient[] = [
  "customer",
  "business",
  "selected_members",
];

export interface CreateTaskStep {
  type: "create_task";
  title?: string; // empty → trigger default title
  due_in_days?: number;
  priority?: "Low" | "Normal" | "High" | "Urgent";
}
export interface AddTagsStep {
  type: "add_tags";
  tags?: string[];
}
export interface AddActivityStep {
  type: "add_activity";
  activity_type?: string;
  subject?: string;
  description?: string;
}
export interface UpdateLeadStageStep {
  type: "update_lead_stage";
  stage?: string;
}
export interface SendEmailStep {
  type: "send_email";
  template_id?: string | null;
  delay_hours?: number;
  hours_before?: number;
  /** Customer/contact by default; members are resolved server-side at send time. */
  recipient?: AutomationRecipient;
  member_ids?: string[];
}
export interface NotifyStep {
  type: "notify";
  kind?: NotifyKind;
  /** Business inbox by default; selected members are resolved server-side. */
  recipient?: Exclude<AutomationRecipient, "customer">;
  member_ids?: string[];
}

export type AutomationStep =
  CreateTaskStep | AddTagsStep | AddActivityStep | UpdateLeadStageStep | SendEmailStep | NotifyStep;

export interface AutomationConditions {
  scope_form_id?: string | null;
  scope_service_id?: string | null;
  scope_resource_id?: string | null;
  only_new_contacts?: boolean;
  skip_unsubscribed?: boolean;
  /** lead_stage_changed only: fire when a lead moves INTO this stage. */
  lead_stage?: string | null;
}

export const EMPTY_CONDITIONS: AutomationConditions = {
  scope_form_id: null,
  scope_service_id: null,
  scope_resource_id: null,
  only_new_contacts: false,
  skip_unsubscribed: true,
  lead_stage: null,
};

export interface AutomationActionConfig {
  steps: AutomationStep[];
  conditions: AutomationConditions;
}

export const DEFAULT_ACTION_CONFIG: AutomationActionConfig = {
  steps: [{ type: "create_task", title: "", due_in_days: 3, priority: "Normal" }],
  conditions: { ...EMPTY_CONDITIONS },
};

export interface Automation {
  id: string;
  organizationId: string;
  triggerType: AutomationTrigger;
  name: string | null;
  active: boolean;
  actionConfig: AutomationActionConfig;
  createdAt: string;
  updatedAt: string;
}

const KNOWN_PRIORITIES = new Set(["Low", "Normal", "High", "Urgent"]);
const KNOWN_NOTIFY_KINDS = new Set<string>(NOTIFY_KINDS);
const KNOWN_RECIPIENTS = new Set<string>(AUTOMATION_RECIPIENTS);

function parseMemberIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 25);
}

function clampDays(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(365, v));
}

function clampHours(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(24 * 365, v));
}

function parseStep(raw: Record<string, unknown>): AutomationStep | null {
  const type = String(raw.type ?? "");
  switch (type) {
    case "create_task": {
      const priority = String(raw.priority ?? "Normal");
      return {
        type: "create_task",
        title: typeof raw.title === "string" ? raw.title : "",
        due_in_days: clampDays(raw.due_in_days),
        priority: KNOWN_PRIORITIES.has(priority)
          ? (priority as CreateTaskStep["priority"])
          : "Normal",
      };
    }
    case "add_tags": {
      const tags = Array.isArray(raw.tags)
        ? (raw.tags as unknown[])
            .map((t) => String(t ?? "").trim())
            .filter(Boolean)
            .slice(0, 20)
        : [];
      return { type: "add_tags", tags: [...new Set(tags)] };
    }
    case "add_activity":
      return {
        type: "add_activity",
        activity_type: typeof raw.activity_type === "string" ? raw.activity_type : "automation",
        subject: typeof raw.subject === "string" ? raw.subject : "",
        description: typeof raw.description === "string" ? raw.description : "",
      };
    case "update_lead_stage":
      return {
        type: "update_lead_stage",
        stage: typeof raw.stage === "string" ? raw.stage : "",
      };
    case "send_email":
      return {
        type: "send_email",
        template_id: raw.template_id ? String(raw.template_id) : null,
        delay_hours: clampHours(raw.delay_hours),
        hours_before: clampHours(raw.hours_before),
        recipient: KNOWN_RECIPIENTS.has(String(raw.recipient))
          ? (raw.recipient as AutomationRecipient)
          : "customer",
        member_ids: parseMemberIds(raw.member_ids),
      };
    case "notify": {
      const kind = String(raw.kind ?? "new_lead");
      return {
        type: "notify",
        kind: KNOWN_NOTIFY_KINDS.has(kind) ? (kind as NotifyKind) : "new_lead",
        recipient: raw.recipient === "selected_members" ? "selected_members" : "business",
        member_ids: parseMemberIds(raw.member_ids),
      };
    }
    default:
      return null;
  }
}

function parseConditions(raw: Record<string, unknown> | null | undefined): AutomationConditions {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    scope_form_id: obj.scope_form_id ? String(obj.scope_form_id) : null,
    scope_service_id: obj.scope_service_id ? String(obj.scope_service_id) : null,
    scope_resource_id: obj.scope_resource_id ? String(obj.scope_resource_id) : null,
    only_new_contacts: obj.only_new_contacts === true,
    skip_unsubscribed: obj.skip_unsubscribed !== false,
    lead_stage: obj.lead_stage ? String(obj.lead_stage) : null,
  };
}

/**
 * Coerce an arbitrary jsonb row into the typed config (defensive).
 * Accepts the legacy 0007 flat shape and normalizes it to one task step.
 */
export function parseActionConfig(raw: unknown): AutomationActionConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;

  // legacy flat shape from 0007
  if (!Array.isArray(obj.steps)) {
    const legacy = obj.create_follow_up_task === true;
    if (!legacy) return { steps: [], conditions: { ...EMPTY_CONDITIONS } };
    const due = clampDays(obj.due_in_days);
    return {
      steps: [{ type: "create_task", title: "", due_in_days: due, priority: "Normal" }],
      conditions: { ...EMPTY_CONDITIONS },
    };
  }

  const steps = (obj.steps as unknown[])
    .map((s) => parseStep((s ?? {}) as Record<string, unknown>))
    .filter((s): s is AutomationStep => s !== null)
    .slice(0, 20);

  return {
    steps,
    conditions: parseConditions(obj.conditions as Record<string, unknown> | undefined),
  };
}
