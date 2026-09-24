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
  appointment: Record<string, unknown> | null,
): Record<string, string | undefined> {
  const service = appointment?.service as { name?: string } | null;
  const timezone = String(appointment?.timezone ?? org?.timezone ?? "America/Halifax");
  const startsAt = appointment?.starts_at ? new Date(String(appointment.starts_at)) : null;
  const appointmentDate = startsAt
    ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone, dateStyle: "long" }).format(startsAt)
    : "";
  const appointmentTime = startsAt
    ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone, timeStyle: "short" }).format(startsAt)
    : "";
  return {
    first_name: (contact?.first_name as string) || "",
    last_name: (contact?.last_name as string) || "",
    business_name: (org?.name as string) || "",
    business_email: (org?.email as string) || "",
    phone: (org?.phone as string) || "",
    setup_url: `${baseUrl()}/dashboard/automations`,
    dashboard_url: `${baseUrl()}/dashboard`,
    service_name: service?.name ?? "Appointment",
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    booking_link: appointment?.token
      ? `${baseUrl()}/${String(org?.slug ?? "")}/book/${String(appointment.token)}`
      : undefined,
    ...(typeof step.vars === "object" && step.vars !== null
      ? (step.vars as Record<string, string | undefined>)
      : {}),
  };
}

/** Deliver one template email via Resend (no-op + log when the key is unset). */
async function sendTemplateEmail(
  org: Record<string, unknown> | null,
  to: string,
  template: { subject: string; body: string } | null,
  vars: Record<string, string | undefined>,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
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

/** Resolve configured recipients without trusting IDs stored in JSON config. */
async function resolveRecipients(
  admin: SupabaseClient,
  orgId: string,
  step: Record<string, unknown>,
  defaultRecipient: "customer" | "business",
  org: Record<string, unknown> | null,
  contact: Record<string, unknown> | null,
): Promise<string[]> {
  const recipient = String(step.recipient ?? defaultRecipient);
  if (recipient === "customer") {
    const email = contact?.email as string | null;
    return email?.trim() ? [email.trim()] : [];
  }
  if (recipient === "business") {
    const email = org?.email as string | null;
    return email?.trim() ? [email.trim()] : [];
  }
  if (recipient !== "selected_members" || !Array.isArray(step.member_ids)) return [];
  const requested = step.member_ids.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (requested.length === 0) return [];
  const { data: memberships } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .in("user_id", requested);
  const emails = await Promise.all(
    (memberships ?? []).map(async ({ user_id }) => {
      const { data } = await admin.rpc("get_user_email", { p_user_id: user_id });
      return typeof data === "string" ? data.trim() : "";
    }),
  );
  return [...new Set(emails.filter(Boolean))];
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
    .select("id, name, slug, email, timezone")
    .eq("id", orgId)
    .maybeSingle();
  const { data: contact } = row.contact_id
    ? await admin
        .from("contacts")
        .select("id, first_name, last_name, email, unsubscribed_at")
        .eq("id", row.contact_id)
        .maybeSingle()
    : { data: null };
  const { data: appointment } = row.appointment_id
    ? await admin
        .from("appointments")
        .select("starts_at, ends_at, timezone, token, status, service:services(name)")
        .eq("id", row.appointment_id)
        .maybeSingle()
    : { data: null };

  if (row.trigger_type === "appointment_reminder" &&
      (!appointment || !["Scheduled", "Confirmed"].includes(String(appointment.status)))) {
    return { ok: true, skipped: true };
  }

  const vars = renderVars(
    row.step,
    (org as Record<string, unknown> | null) ?? null,
    contact as Record<string, unknown> | null,
    appointment as Record<string, unknown> | null,
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
      const recipients = await resolveRecipients(
        admin, orgId, row.step, "customer", (org as Record<string, unknown> | null) ?? null,
        (contact as Record<string, unknown> | null) ?? null,
      );
      if (recipients.length === 0) return { ok: true, skipped: true };
      for (const to of recipients) {
        const outcome = await sendTemplateEmail((org as Record<string, unknown> | null) ?? null, to, template, vars);
        if (!outcome.ok) return outcome;
      }
      return { ok: true };
    }
    case "notify": {
      const kind = notifyKindFor(row.step, row.trigger_type);
      const recipients = await resolveRecipients(
        admin, orgId, row.step, "business", (org as Record<string, unknown> | null) ?? null,
        (contact as Record<string, unknown> | null) ?? null,
      );
      if (recipients.length === 0) return { ok: true, skipped: true };
      for (const to of recipients) {
        await sendNotificationEmail({
          kind: kind as Parameters<typeof sendNotificationEmail>[0]["kind"],
          to,
          orgName: (org?.name as string) || "",
          contactName: (contact?.first_name as string) || "",
          extras: { automation: row.trigger_type },
        });
      }
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

/** Enqueue each configured appointment reminder once when its time arrives. */
export async function enqueueDueAppointmentReminders(): Promise<number> {
  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 86400_000).toISOString();
  const { data: automations } = await admin
    .from("automations")
    .select("id, organization_id, action_config")
    .eq("trigger_type", "appointment_reminder")
    .eq("active", true);
  let queued = 0;
  for (const automation of automations ?? []) {
    const config = (automation.action_config ?? {}) as { steps?: Record<string, unknown>[] };
    const steps = Array.isArray(config.steps) ? config.steps : [];
    const { data: appointments } = await admin
      .from("appointments")
      .select("id, contact_id, lead_id, organization_id, starts_at")
      .eq("organization_id", automation.organization_id)
      .in("status", ["Scheduled", "Confirmed"])
      .gte("starts_at", now.toISOString())
      .lte("starts_at", horizon);
    for (const appointment of appointments ?? []) {
      for (const step of steps) {
        if (!step || (step.type !== "send_email" && step.type !== "notify")) continue;
        const hoursBefore = Math.max(0, Number(step.hours_before ?? 24));
        const runAt = new Date(new Date(String(appointment.starts_at)).getTime() - hoursBefore * 3600000);
        if (runAt > now) continue;
        const { data: existing } = await admin
          .from("automation_actions")
          .select("id, step")
          .eq("appointment_id", appointment.id)
          .eq("trigger_type", "appointment_reminder");
        const duplicate = (existing ?? []).some((row) => JSON.stringify(row.step) === JSON.stringify(step));
        if (duplicate) continue;
        const { error } = await admin.from("automation_actions").insert({
          organization_id: automation.organization_id,
          trigger_type: "appointment_reminder",
          step,
          contact_id: appointment.contact_id,
          lead_id: appointment.lead_id,
          appointment_id: appointment.id,
          run_at: now.toISOString(),
        });
        if (!error) queued += 1;
      }
    }
  }
  return queued;
}
