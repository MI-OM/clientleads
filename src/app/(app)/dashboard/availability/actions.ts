"use server";

import { localDateTimeToUtc } from "@/lib/timezone";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyOrg } from "@/lib/auth/org";

export interface AvailabilityActionState {
  error?: string;
  ok?: boolean;
}

function canManage(ctx: Awaited<ReturnType<typeof getMyOrg>>): ctx is NonNullable<typeof ctx> {
  return !!ctx && (ctx.role === "owner" || ctx.role === "admin");
}

interface RuleInput {
  day: number;
  start: string;
  end: string;
}

function parseRule(formData: FormData): RuleInput | { error: string } {
  const day = Number(formData.get("day"));
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "Pick a day of the week." };
  const start = String(formData.get("start") ?? "").trim();
  const end = String(formData.get("end") ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return { error: "Start and end times are required (HH:MM)." };
  }
  if (start >= end) return { error: "End time must be after the start time." };
  return { day, start, end };
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Owner/admin-only: add a weekly availability rule (PRD §17). */
export async function addAvailabilityRuleAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return { error: "Only owners and administrators can change availability." };

  const parsed = parseRule(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createClient();

  // Reject overlapping rules on the same day — keeps the weekly grid sane.
  const { data: existing } = await supabase
    .from("availability_rules")
    .select("id,start_time,end_time")
    .eq("organization_id", ctx.org.id)
    .eq("day_of_week", parsed.day);
  if (existing?.some((r) => rangesOverlap(parsed.start, parsed.end, r.start_time, r.end_time))) {
    return { error: "That overlaps an existing window for this day." };
  }

  const { error } = await supabase.from("availability_rules").insert({
    organization_id: ctx.org.id,
    user_id: null,
    day_of_week: parsed.day,
    start_time: parsed.start,
    end_time: parsed.end,
    timezone: ctx.org.timezone ?? "America/Halifax",
    active: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/availability");
  return { ok: true };
}

/** Owner/admin-only: delete a rule. */
export async function deleteAvailabilityRuleAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("availability_rules").delete().eq("id", id).eq("organization_id", ctx.org.id);
  revalidatePath("/dashboard/availability");
}

/** Owner/admin-only: add a blocked time (PRD §18). */
export async function addBlockedTimeAction(
  _prev: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return { error: "Only owners and administrators can block time." };

  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const startDate = startsAt
    ? localDateTimeToUtc(startsAt, ctx.org.timezone ?? "America/Halifax")
    : null;
  const endDate = endsAt ? localDateTimeToUtc(endsAt, ctx.org.timezone ?? "America/Halifax") : null;
  if (!startDate || !endDate) return { error: "Start and end date/time are required." };
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "Those dates don't look valid." };
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return { error: "End must be after the start." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("blocked_times").insert({
    organization_id: ctx.org.id,
    user_id: null,
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    reason,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/availability");
  return { ok: true };
}

/** Owner/admin-only: remove a blocked time. */
export async function deleteBlockedTimeAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!canManage(ctx)) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("blocked_times").delete().eq("id", id).eq("organization_id", ctx.org.id);
  revalidatePath("/dashboard/availability");
}
