"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyBookError } from "@/lib/booking/errors";
import { notifyBookingChange } from "@/lib/booking/notify";

export interface ManageState {
  error?: string;
  ok?: boolean;
  status?: string;
  startsAt?: string;
  endsAt?: string;
}

/** Public cancellation via the secure token link (PRD §20). */
export async function cancelBookingAction(
  _prev: ManageState,
  formData: FormData,
): Promise<ManageState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Missing booking reference." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cancel_appointment", { p_token: token });
  if (error || !data?.ok) {
    return { error: friendlyBookError(error?.message ?? String(data ?? "CANCEL_FAILED")) };
  }

  revalidatePath(`/${slug}/book/${token}`);
  await notifyBookingChange(admin, token, slug, "cancelled");
  return { ok: true, status: "Cancelled" };
}

/** Public reschedule via the secure token link (PRD §21). */
export async function rescheduleBookingAction(
  _prev: ManageState,
  formData: FormData,
): Promise<ManageState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const newStarts = String(formData.get("newStarts") ?? "").trim();
  if (!token) return { error: "Missing booking reference." };
  if (!newStarts) return { error: "Pick a new time." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reschedule_appointment", {
    p_token: token,
    p_new_starts: newStarts,
  });
  if (error || !data?.ok) {
    return { error: friendlyBookError(error?.message ?? String(data ?? "RESCHEDULE_FAILED")) };
  }

  revalidatePath(`/${slug}/book/${token}`);
  await notifyBookingChange(admin, token, slug, "rescheduled");
  return {
    ok: true,
    status: data.status ? String(data.status) : "Rescheduled",
    startsAt: String(data.starts_at),
    endsAt: String(data.ends_at),
  };
}
