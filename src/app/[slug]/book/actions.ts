"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyBookError } from "@/lib/booking/errors";
import { notifyBookingChange } from "@/lib/booking/notify";
import { baseUrl } from "@/lib/email/send";

export interface BookState {
  error?: string;
  booked?: {
    serviceName: string;
    startsAt: string;
    endsAt: string;
    manageUrl: string;
  };
}

/** Best-effort client IP for rate limiting — hashed, never stored raw. */
async function ipHash(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    return createHash("sha256").update(ip).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Public booking creation (PRD §19). Server-action only: honeypot + shape
 * checks here, then the SECURITY DEFINER book_appointment RPC does the real
 * validation (slot availability, conflict, rate limit) with the service role
 * key, which never reaches the browser.
 */
export async function bookAppointmentAction(
  _prev: BookState,
  formData: FormData,
): Promise<BookState> {
  // Honeypot — real visitors never see this field.
  if (String(formData.get("company_website") ?? "").trim() !== "") {
    return { error: "Submission rejected." };
  }

  const slug = String(formData.get("slug") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!slug || !/^[0-9a-f-]{36}$/i.test(serviceId) || !startsAt) {
    return { error: "Please pick a time to book." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("book_appointment", {
    p_service_id: serviceId,
    p_starts_at: startsAt,
    p_name: name,
    p_email: email,
    p_phone: phone || null,
    p_notes: notes || null,
    p_ip_hash: await ipHash(),
  });
  if (error || !data?.ok) {
    return { error: friendlyBookError(error?.message ?? String(data ?? "BOOKING_FAILED")) };
  }

  const token = String(data.token);
  await notifyBookingChange(admin, token, slug, "booked");

  return {
    booked: {
      serviceName: String(data.service_name),
      startsAt: String(data.starts_at),
      endsAt: String(data.ends_at),
      manageUrl: `${baseUrl()}/${slug}/book/${token}`,
    },
  };
}
