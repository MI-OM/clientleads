/**
 * M6.5 — the app-side half of the automation engine.
 *
 * Trigger functions enqueue steps that SQL cannot execute itself
 * (send_email, notify, or any step with delay_hours > 0) into
 * public.automation_actions. This module drains that queue:
 *
 *   create_task         → create_follow_up_task RPC (service role)
 *   add_tags            → ensure_contact_tag RPC per tag
 *   add_activity        → log_activity RPC
 *   update_lead_stage   → leads update + activity (service role inline)
 *   send_email          → render the org email template + Resend
 *                         (graceful no-op / skip without RESEND_API_KEY)
 *   notify              → sendNotificationEmail (same no-op contract)
 *
 * Called from /api/automations/run (CRON_SECRET-gated, like the campaign
 * scheduler). Never throws for a single row — per-row failures are counted
 * and surface in attempts/last_error.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplate } from "@/lib/email/campaign";
import { sendNotificationEmail } from "@/lib/email/notify";
import { baseUrl } from "@/lib/email/send";
import type { SupabaseClient } from "@supabase/supabase-js";

const RESEND_API = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 3;
const BATCH_LIMIT = 50;

export interface AutomationRunResult {
  processed: number;
  ok: number;
  failed: number;
  skipped: number;
}

interface QueueRow {
  id: string;
  organization_id: string;
  trigger_type: string;
  step: Record<string, unknown>;
  contact_id: string | null;
  lead_id: string | null;
  appointment_id: string | null;
}

/** Render {{vars}} (plus unsubscribe link support) for automation emails. */
function renderVars(
  step: Record<string, unknown>,
  org: Record<string, unknown> | null,
  contact: Record<string, unknown> | null,
): Record<string, string | undefined> {
  return {
    first_name: (contact?.first_name as string) || "",
    last_name: (contact?.last_name as string) || "",
    business_name: (org?.name as string) || "",
    business_email: (org?.email as string) || "",
    phone: (org?.phone as string) || "",
    setup_url: `${baseUrl()}/dashboard/automations`,
    dashboard_url: `${baseUrl()}/dashboard`,
    ...(typeof step.vars === "object" && step.vars !== null
      ? (step.vars as Record<string, string | undefined>)
      : {}),
  };
}

/** Deliver one template email via Resend (no-op + log when the key is unset). */
async function sendTemplateEmail(
  org: Record<string, unknown> | null,
  contact: Record<string, unknown> | null,
  template: { subject: string; body: string } | null,
  vars: Record<string, string | undefined>,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const to = (contact?.email as string | null) ?? null;
  if (!to) return { ok: false, error: "CONTACT_NO_EMAIL" };
  if (!template) return { ok: false, error: "TEMPLATE_NOT_FOUND" };

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[automations] RESEND_API_KEY not set — skipping automation email to ${to}`);
    return { ok: true, skipped: true };
  }

  const subject = renderTemplate(template.subject, vars);
  const body = renderTemplate(template.body, vars);
  const from = process.env.EMAIL_FROM ?? "ClientLeads <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `RESEND_${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Resolve the org's email template by id (NULL-safe). */
async function resolveTemplate(
  admin: SupabaseClient,
  orgId: string,
  templateId: string | null | undefined,
): Promise<{ subject: string; body: string } | null> {
  if (!templateId) return null;
  const { data, error } = await admin
    .from("email_templates")
    .select("subject, body")
    .eq("organization_id", orgId)
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return null;
  return { subject: String(data.subject), body: String(data.body) };
}

function notifyKindFor(step: Record<string, unknown>, trigger: string): string {
  if (typeof step.kind === "string" && step.kind) return step.kind;
  switch (trigger) {
    case "form_submitted":
      return "form_submission";
    case "appointment_booked":
      return "appointment_created";
    case "appointment_cancelled":
      return "appointment_cancelled";
    case "appointment_no_show":
      return "appointment_cancelled";
    default:
      return "new_lead";
  }
}

async function runRow(
  admin: SupabaseClient,
  row: QueueRow,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const orgId = row.organization_id;
  const type = String(row.step.type ?? "");

  // shared context
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug, email")
    .eq("id", orgId)
    .maybeSingle();
  const { data: contact } = row.contact_id
    ? await admin
        .from("contacts")
        .select("id, first_name, last_name, email, unsubscribed_at")
        .eq("id", row.contact_id)
        .maybeSingle()
    : { data: null };

  const vars = renderVars(
    row.step,
    (org as Record<string, unknown> | null) ?? null,
    contact as Record<string, unknown> | null,
  );

  switch (type) {
    case "create_task": {
      const { error } = await admin.rpc("create_follow_up_task", {
        p_org_id: orgId,
        p_trigger: row.trigger_type,
        p_config: {
          create_follow_up_task: true,
          due_in_days: Number(row.step.due_in_days ?? 0),
        },
        p_title: String(row.step.title ?? "").trim() || `Automated follow-up (${row.trigger_type})`,
        p_contact_id: row.contact_id,
        p_lead_id: row.lead_id,
        p_appointment_id: row.appointment_id,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    case "add_tags": {
      const tags = Array.isArray(row.step.tags) ? (row.step.tags as string[]) : [];
      if (!row.contact_id || tags.length === 0) return { ok: true, skipped: true };
      for (const name of tags) {
        const { error } = await admin.rpc("ensure_contact_tag", {
          p_org_id: orgId,
          p_contact_id: row.contact_id,
          p_tag_name: name,
        });
        if (error) return { ok: false, error: error.message };
      }
      return { ok: true };
    }
    case "add_activity": {
      const { error } = await admin.rpc("log_activity", {
        p_organization_id: orgId,
        p_contact_id: row.contact_id,
        p_lead_id: row.lead_id,
        p_activity_type: String(row.step.activity_type ?? "automation"),
        p_subject: String(row.step.subject ?? "Automated activity"),
        p_description: String(row.step.description ?? ""),
        p_metadata: { source_trigger: row.trigger_type },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    case "update_lead_stage": {
      const stage = String(row.step.stage ?? "").trim();
      if (!row.lead_id || !stage) return { ok: true, skipped: true };
      const { error } = await admin
        .from("leads")
        .update({ stage })
        .eq("id", row.lead_id)
        .eq("organization_id", orgId);
      if (error) return { ok: false, error: error.message };
      await admin.rpc("log_activity", {
        p_organization_id: orgId,
        p_contact_id: row.contact_id,
        p_lead_id: row.lead_id,
        p_activity_type: "lead_stage_changed",
        p_subject: "Lead stage changed by automation",
        p_description: `Stage set to ${stage}`,
        p_metadata: { source_trigger: row.trigger_type, stage },
      });
      return { ok: true };
    }
    case "send_email": {
      const template = await resolveTemplate(admin, orgId, row.step.template_id as string | null);
      return sendTemplateEmail(
        (org as Record<string, unknown> | null) ?? null,
        (contact as Record<string, unknown> | null) ?? null,
        template,
        vars,
      );
    }
    case "notify": {
      const kind = notifyKindFor(row.step, row.trigger_type);
      const orgEmail = (org?.email as string | null) ?? null;
      if (!orgEmail) return { ok: true, skipped: true };
      await sendNotificationEmail({
        kind: kind as Parameters<typeof sendNotificationEmail>[0]["kind"],
        to: orgEmail,
        orgName: (org?.name as string) || "",
        contactName: (contact?.first_name as string) || "",
        extras: { automation: row.trigger_type },
      });
      return { ok: true };
    }
    default:
      return { ok: false, error: `UNKNOWN_STEP_${type}` };
  }
}

/**
 * Drain due, pending automation actions. Call from the cron route
 * (CRON_SECRET-gated); safe to invoke repeatedly.
 */
export async function processDueAutomationActions(
  limit = BATCH_LIMIT,
): Promise<AutomationRunResult> {
  const admin = createAdminClient();
  const result: AutomationRunResult = { processed: 0, ok: 0, failed: 0, skipped: 0 };

  const { data: due, error } = await admin
    .from("automation_actions")
    .select(
      "id, organization_id, trigger_type, step, contact_id, lead_id, appointment_id, attempts",
    )
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(limit);

  if (error || !due) return result;
  result.processed = due.length;

  for (const raw of due) {
    const row: QueueRow = {
      id: String(raw.id),
      organization_id: String(raw.organization_id),
      trigger_type: String(raw.trigger_type),
      step: (raw.step ?? {}) as Record<string, unknown>,
      contact_id: raw.contact_id ? String(raw.contact_id) : null,
      lead_id: raw.lead_id ? String(raw.lead_id) : null,
      appointment_id: raw.appointment_id ? String(raw.appointment_id) : null,
    };

    const outcome = await runRow(admin, row);
    const attempts = Number(raw.attempts ?? 0) + 1;
    const nextStatus = outcome.ok ? "done" : attempts >= MAX_ATTEMPTS ? "failed" : "pending";

    // move a failed row back to the end of the queue on retry
    const patch: Record<string, unknown> = {
      status: nextStatus,
      attempts,
      last_error: outcome.error ?? null,
      executed_at: outcome.ok ? new Date().toISOString() : null,
    };

    await admin.from("automation_actions").update(patch).eq("id", row.id);

    if (outcome.ok) result.ok += 1;
    else if (outcome.error) result.failed += 1;
    else result.skipped += 1;
  }

  return result;
}
