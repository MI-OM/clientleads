"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getMyOrg } from "@/lib/auth/org";
import { getAutomation } from "@/lib/automations/queries";
import { DEFAULT_ACTION_CONFIG } from "@/lib/automations/types";
import type { AutomationActionConfig, AutomationStep } from "@/lib/automations/types";
import {
  AUTOMATION_RECIPIENTS,
  AUTOMATION_STEP_TYPES,
  NOTIFY_KINDS,
} from "@/lib/automations/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AutomationActionState {
  error?: string;
  ok?: boolean;
}

function isAdmin(ctx: Awaited<ReturnType<typeof getMyOrg>>): boolean {
  return !!ctx && (ctx.role === "owner" || ctx.role === "admin");
}

/** Clamp to [0, 365] days; junk falls back to the default. */
function clampDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 3;
  return Math.max(0, Math.min(365, Math.round(n)));
}

function clampHours(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(24 * 365, Math.round(n)));
}

function cleanTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const tags = list.map((t) => String(t).trim()).filter(Boolean);
  return [...new Set(tags)].slice(0, 20);
}

function cleanMemberIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(String).filter((id) => UUID_RE.test(id)))].slice(0, 25);
}

function parseStepInput(raw: unknown): AutomationStep | null {
  if (typeof raw !== "object" || raw === null) return null;
  const step = raw as Record<string, unknown>;
  const type = String(step.type ?? "");
  if (!AUTOMATION_STEP_TYPES.includes(type as AutomationStep["type"])) return null;

  switch (type) {
    case "create_task":
      return {
        type,
        title: String(step.title ?? "").slice(0, 200),
        due_in_days: clampDays(step.due_in_days),
        priority: (["Low", "Normal", "High", "Urgent"] as const).includes(
          step.priority as "Low" | "Normal" | "High" | "Urgent",
        )
          ? (step.priority as "Low" | "Normal" | "High" | "Urgent")
          : "Normal",
      };
    case "add_tags":
      return { type, tags: cleanTags(step.tags) };
    case "add_activity":
      return {
        type,
        activity_type: String(step.activity_type ?? "automation").slice(0, 60),
        subject: String(step.subject ?? "").slice(0, 200),
        description: String(step.description ?? "").slice(0, 2000),
      };
    case "update_lead_stage":
      return { type, stage: String(step.stage ?? "").slice(0, 60) };
    case "send_email":
      return {
        type,
        template_id: step.template_id ? String(step.template_id) : null,
        delay_hours: clampHours(step.delay_hours),
        hours_before: clampHours(step.hours_before),
        recipient: AUTOMATION_RECIPIENTS.includes(
          step.recipient as (typeof AUTOMATION_RECIPIENTS)[number],
        )
          ? (step.recipient as "customer" | "business" | "selected_members")
          : "customer",
        member_ids: cleanMemberIds(step.member_ids),
      };
    case "notify":
      return {
        type,
        kind: NOTIFY_KINDS.includes(step.kind as (typeof NOTIFY_KINDS)[number])
          ? (step.kind as (typeof NOTIFY_KINDS)[number])
          : "new_lead",
        recipient: step.recipient === "selected_members" ? "selected_members" : "business",
        member_ids: cleanMemberIds(step.member_ids),
      };
    default:
      return null;
  }
}

function parseConfig(raw: unknown): AutomationActionConfig {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_ACTION_CONFIG };
  const obj = raw as Record<string, unknown>;

  const steps = (Array.isArray(obj.steps) ? obj.steps : [])
    .map(parseStepInput)
    .filter((s): s is AutomationStep => s !== null)
    .slice(0, 20);

  const condRaw = (
    typeof obj.conditions === "object" && obj.conditions !== null ? obj.conditions : {}
  ) as Record<string, unknown>;

  return {
    steps:
      steps.length > 0
        ? steps
        : [{ type: "create_task", title: "", due_in_days: 3, priority: "Normal" }],
    conditions: {
      scope_form_id: condRaw.scope_form_id ? String(condRaw.scope_form_id) : null,
      scope_service_id: condRaw.scope_service_id ? String(condRaw.scope_service_id) : null,
      scope_resource_id: condRaw.scope_resource_id ? String(condRaw.scope_resource_id) : null,
      only_new_contacts: condRaw.only_new_contacts === true,
      skip_unsubscribed: condRaw.skip_unsubscribed !== false,
      lead_stage: condRaw.lead_stage ? String(condRaw.lead_stage) : null,
    },
  };
}

/** Turn an automation on/off (owner/admin only). */
export async function toggleAutomationAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx || !isAdmin(ctx)) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  const user = await getCurrentUser();
  const automation = await getAutomation(ctx.org.id, id);
  if (!automation) return;

  const next = !automation.active;
  const { error } = await supabase
    .from("automations")
    .update({ active: next })
    .eq("id", id)
    .eq("organization_id", ctx.org.id);
  if (error) return;

  try {
    if (user?.id) {
      await supabase.rpc("log_audit", {
        p_organization_id: ctx.org.id,
        p_user_id: user.id,
        p_action: "automation.toggled",
        p_entity_type: "automation",
        p_entity_id: id,
        p_before: { active: automation.active },
        p_after: { active: next },
      });
    }
    await supabase.rpc("log_activity", {
      p_organization_id: ctx.org.id,
      p_contact_id: null,
      p_lead_id: null,
      p_activity_type: "automation_toggled",
      p_subject: "Automation toggled",
      p_description: `${automation.name ?? automation.triggerType} → ${next ? "on" : "off"}`,
      p_metadata: { automation_id: id, active: next },
    });
  } catch {
    // best-effort
  }

  revalidatePath("/dashboard/automations");
}

/**
 * Update an automation's workflow (steps + conditions).
 * The client form submits a single JSON `config` field.
 */
export async function updateAutomationAction(
  _prev: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (!isAdmin(ctx)) return { error: "Only owners and admins can configure automations." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing automation id." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const automation = await getAutomation(ctx.org.id, id);
  if (!automation) return { error: "Automation not found." };

  let after: AutomationActionConfig;
  try {
    const raw = formData.get("config");
    after = parseConfig(raw ? JSON.parse(String(raw)) : null);
  } catch {
    return { error: "Invalid automation configuration." };
  }

  const before = { ...automation.actionConfig };
  const { error } = await supabase
    .from("automations")
    .update({ action_config: after })
    .eq("id", id)
    .eq("organization_id", ctx.org.id);
  if (error) return { error: error.message };

  try {
    if (user?.id) {
      await supabase.rpc("log_audit", {
        p_organization_id: ctx.org.id,
        p_user_id: user.id,
        p_action: "automation.updated",
        p_entity_type: "automation",
        p_entity_id: id,
        p_before: before,
        p_after: after,
      });
    }
    await supabase.rpc("log_activity", {
      p_organization_id: ctx.org.id,
      p_contact_id: null,
      p_lead_id: null,
      p_activity_type: "automation_updated",
      p_subject: "Automation updated",
      p_description: automation.name ?? automation.triggerType,
      p_metadata: { automation_id: id, config: after },
    });
  } catch {
    // best-effort
  }

  revalidatePath("/dashboard/automations");
  return { ok: true };
}
