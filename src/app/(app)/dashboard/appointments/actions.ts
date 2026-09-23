"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyOrg } from "@/lib/auth/org";
import type { AppointmentStatus } from "@/lib/booking/types";

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  Scheduled: ["Confirmed", "Cancelled"],
  Rescheduled: ["Confirmed", "Cancelled"],
  Confirmed: ["Completed", "Cancelled", "No-show"],
  Completed: [],
  Cancelled: [],
  "No-show": [],
};

/** Owner/admin-only: change an appointment's status in the dashboard. */
export async function setAppointmentStatusAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "admin")) return;

  const id = String(formData.get("id") ?? "");
  const next = formData.get("status") as AppointmentStatus | null;
  if (!id || !next) return;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("appointments")
    .select("status")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!current) return;

  const from = current.status as AppointmentStatus;
  if (!ALLOWED_TRANSITIONS[from]?.includes(next)) return;

  await supabase
    .from("appointments")
    .update({ status: next })
    .eq("id", id)
    .eq("organization_id", ctx.org.id);

  revalidatePath("/dashboard/appointments");
}
