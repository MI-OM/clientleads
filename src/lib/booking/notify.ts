import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBookingEmails, baseUrl, type BookingEmailKind } from "@/lib/email/send";

interface AppointmentEmailRow {
  customer_name: string;
  customer_email: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  service: { name: string } | null;
  organization: { name: string; email: string | null } | null;
}

/**
 * Best-effort booking notification emails after a successful change.
 * Fetching the appointment row by token (service role) lets us build both
 * the business + customer emails with the fresh times/service names. Never
 * throws — mail is best-effort.
 */
export async function notifyBookingChange(
  admin: SupabaseClient,
  token: string,
  slug: string,
  kind: BookingEmailKind,
): Promise<void> {
  const { data } = await admin
    .from("appointments")
    .select(
      "customer_name, customer_email, starts_at, ends_at, timezone, service:services(name), organization:organizations(name,email)",
    )
    .eq("token", token)
    .maybeSingle();
  if (!data) return;

  const row = data as unknown as AppointmentEmailRow;
  await sendBookingEmails({
    kind,
    orgName: row.organization?.name ?? "the business",
    orgEmail: row.organization?.email ?? null,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    serviceName: row.service?.name ?? "Appointment",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    manageUrl: `${baseUrl()}/${slug}/book/${token}`,
  });
}
