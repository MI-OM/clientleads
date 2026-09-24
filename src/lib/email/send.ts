/**
 * Transactional email — Resend (REST, no SDK dependency).
 *
 * Safety valve: if `RESEND_API_KEY` is not set (local dev before the key
 * exists) every call is a no-op that logs, so booking flows still work —
 * mail just doesn't leave the box until the key lands. Set it in
 * `.env.local`; `EMAIL_FROM` defaults to Resend's sandbox sender
 * (`onboarding@resend.dev`) so no domain is required to test.
 */

const RESEND_API = "https://api.resend.com/emails";

export function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
/** Human "Thursday, September 24, 2026 at 9:30 AM" in the org timezone. */
function formatWhen(startsAt: string, endsAt: string, timezone: string): string {
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(start);
    const times = `${new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(start)}–${new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(end)}`;
    return `${date} · ${times} (${timezone})`;
  } catch {
    return new Date(startsAt).toString();
  }
}
export type BookingEmailKind = "booked" | "cancelled" | "rescheduled";

export interface BookingEmailData {
  kind: BookingEmailKind;
  orgName: string;
  orgEmail: string | null;
  customerEmail: string;
  customerName: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  manageUrl: string;
}

const KIND_LABEL: Record<BookingEmailKind, string> = {
  booked: "booking confirmed",
  cancelled: "booking cancelled",
  rescheduled: "booking rescheduled",
};

/**
 * Sends the business + customer emails for a booking change.
 * Never throws — email is best-effort; the booking itself is already saved.
 */
export async function sendBookingEmails(data: BookingEmailData): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(
      `[email] RESEND_API_KEY not set — skipping "${data.kind}" email to ${data.customerEmail}`,
    );
    return;
  }

  const when = formatWhen(data.startsAt, data.endsAt, data.timezone);
  const customerSeesManage =
    data.kind === "booked"
      ? `\n\nManage your booking anytime (reschedule or cancel):\n${data.manageUrl}\n`
      : "";

  const customerBody =
    data.kind === "booked"
      ? `Hi ${data.customerName},\n\nYour ${data.serviceName} with ${data.orgName} is confirmed:\n${when}${customerSeesManage}\nFor any changes, use the link above.`
      : data.kind === "cancelled"
        ? `Hi ${data.customerName},\n\nYour ${data.serviceName} with ${data.orgName} on ${when} has been cancelled as requested.\n\nBook another time any time with ${data.orgName}.`
        : `Hi ${data.customerName},\n\nYour ${data.serviceName} with ${data.orgName} has been rescheduled to:\n${when}\n\nManage your booking anytime (reschedule or cancel):\n${data.manageUrl}`;

  const businessBody =
    data.kind === "booked"
      ? `New booking for your ${data.orgName} calendar:\n\n  Service: ${data.serviceName}\n  When:    ${when}\n  Name:    ${data.customerName}\n  Email:   ${data.customerEmail}\n  Manage:  ${data.manageUrl}`
      : data.kind === "cancelled"
        ? `A booking was cancelled:\n\n  Service: ${data.serviceName}\n  When:    ${when}\n  Name:    ${data.customerName}\n  Email:   ${data.customerEmail}`
        : `A booking was rescheduled:\n\n  Service: ${data.serviceName}\n  Now:     ${when}\n  Name:    ${data.customerName}\n  Email:   ${data.customerEmail}\n  Manage:  ${data.manageUrl}`;

  const toBusiness = data.orgEmail
    ? [
        {
          to: data.orgEmail,
          subject: `${data.serviceName} — ${KIND_LABEL[data.kind]}`,
          body: businessBody,
        },
      ]
    : [];

  const recipients = [
    ...toBusiness,
    {
      to: data.customerEmail,
      subject: `${data.serviceName} with ${data.orgName} — ${KIND_LABEL[data.kind]}`,
      body: customerBody,
    },
  ];

  const from = process.env.EMAIL_FROM ?? "ClientLeads <onboarding@resend.dev>";

  for (const r of recipients) {
    try {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: r.to,
          subject: r.subject,
          text: r.body,
          html: `<div style="font-family:system-ui,sans-serif;line-height:1.6">${r.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.warn(`[email] Resend ${res.status} for ${r.to}: ${await res.text()}`);
      }
    } catch (err) {
      console.warn(`[email] send failed for ${r.to}:`, err);
    }
  }
}

