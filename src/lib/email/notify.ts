/**
 * M6 notification emails (PRD §34) — the "assigned task / new lead /
 * form submission / appointment change" channel, delivered over email.
 *
 * Same degraded contract as `src/lib/email/send.ts` (do not modify that
 * file): if `RESEND_API_KEY` is not set every call is a no-op that logs,
 * so dashboard flows keep working and mail simply doesn't leave the box
 * until the key lands. Never throws — notifications are best-effort.
 *
 * Wiring today: task-assignment emails fire from the M6 task server
 * actions (`src/app/(app)/dashboard/tasks/actions.ts`). The M3/M4
 * server-action paths are out of scope for this milestone (their trigger
 * paths log activities + create tasks via SQL); the other kinds are
 * exported here for the integrator / M5 to call from those actions.
 */
import { baseUrl } from "./send";
import { DEFAULT_TIME_ZONE, formatDateInZone } from "@/lib/timezone";

const RESEND_API = "https://api.resend.com/emails";

export type NotificationKind =
  | "new_lead"
  | "form_submission"
  | "appointment_created"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "task_assigned";

export interface NotificationEmailData {
  kind: NotificationKind;
  /** Recipient inbox (business address, or the assignee for task_assigned). */
  to: string;
  /** Sender-facing business name, used in subjects/bodies. */
  orgName: string;
  /** Optional detail lines below — each kind uses what it has. */
  contactName?: string | null;
  taskTitle?: string | null;
  dueDate?: string | null;
  appointmentLabel?: string | null;
  /** IANA zone for date rendering (defaults to the app's business region). */
  timeZone?: string;
  extras?: Record<string, string>;
}

function formatDate(value?: string | null, timeZone: string = DEFAULT_TIME_ZONE): string {
  if (!value) return "";
  return formatDateInZone(value, timeZone);
}

function buildNotification(data: NotificationEmailData): { subject: string; body: string } {
  const { kind, orgName, contactName, taskTitle, dueDate, appointmentLabel } = data;
  const who = contactName || "someone";
  const appt = appointmentLabel || "an appointment";

  switch (kind) {
    case "new_lead":
      return {
        subject: `New lead — ${orgName}`,
        body: `A new lead was created for ${orgName}:\n\n  Name:  ${who}\n  See it: ${baseUrl()}/dashboard/leads`,
      };
    case "form_submission":
      return {
        subject: `New form submission — ${orgName}`,
        body: `A visitor submitted a form on your ${orgName} page${data.extras?.form ? ` (${data.extras.form})` : ""}:\n\n  Name:  ${who}\n  See it: ${baseUrl()}/dashboard/leads`,
      };
    case "appointment_created":
      return {
        subject: `New appointment — ${orgName}`,
        body: `A new appointment was booked with ${orgName}:\n\n  Who:  ${who}\n  When: ${appt}\n  Manage: ${baseUrl()}/dashboard/appointments`,
      };
    case "appointment_cancelled":
      return {
        subject: `Appointment cancelled — ${orgName}`,
        body: `An appointment with ${orgName} was cancelled:\n\n  Who:  ${who}\n  When: ${appt}\n  Manage: ${baseUrl()}/dashboard/appointments`,
      };
    case "appointment_rescheduled":
      return {
        subject: `Appointment rescheduled — ${orgName}`,
        body: `An appointment with ${orgName} was rescheduled:\n\n  Who:  ${who}\n  Now:  ${appt}\n  Manage: ${baseUrl()}/dashboard/appointments`,
      };
    case "task_assigned":
      return {
        subject: `Task assigned to you — ${orgName}`,
        body: `You've been assigned a task at ${orgName}:\n\n  Task:  ${taskTitle ?? "Untitled task"}\n  Due:   ${formatDate(dueDate, data.timeZone) || "no due date"}\n\nOpen it: ${baseUrl()}/dashboard/tasks`,
      };
  }
}

/**
 * Sends one notification email. No-op + log when RESEND_API_KEY is unset;
 * swallows transport errors so callers never break on mail failure.
 */
export async function sendNotificationEmail(data: NotificationEmailData): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(
      `[email] RESEND_API_KEY not set — skipping "${data.kind}" notification to ${data.to}`,
    );
    return;
  }

  const { subject, body } = buildNotification(data);
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
        to: data.to,
        subject,
        text: body,
        html: `<div style="font-family:system-ui,sans-serif;line-height:1.6">${body
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/\n/g, "<br>")}</div>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[email] Resend ${res.status} for ${data.to}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`[email] notification send failed for ${data.to}:`, err);
  }
}
