"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyOrg } from "@/lib/auth/org";
import { LOCATION_TYPES } from "@/lib/services/constants";

export interface ServiceActionState {
  error?: string;
}

function int(formData: FormData, key: string, fallback: number): number {
  const value = Number.parseInt(String(formData.get(key) ?? ""), 10);
  return Number.isFinite(value) ? value : fallback;
}

function toNumber(formData: FormData, key: string, min: number, max: number, fallback: number): number {
  const value = Number(String(formData.get(key) ?? "").trim());
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return Math.round(value);
}

/** Owner/admin-only: create a service (PRD §16). */
export async function createServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can manage services." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Service name is required." };

  const locationType = String(formData.get("locationType") ?? "in-person");
  if (!LOCATION_TYPES.includes(locationType as (typeof LOCATION_TYPES)[number])) {
    return { error: "Choose a valid location type." };
  }

  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = priceRaw === "" ? null : Number(priceRaw);
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    return { error: "Price must be a positive number, or leave it blank." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({
    organization_id: ctx.org.id,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    duration_min: toNumber(formData, "durationMin", 5, 24 * 60, 30),
    price,
    currency: String(formData.get("currency") ?? "CAD").trim() || "CAD",
    location_type: locationType,
    location_details: String(formData.get("locationDetails") ?? "").trim() || null,
    booking_enabled: formData.get("bookingEnabled") === "1",
    buffer_before_min: toNumber(formData, "bufferBeforeMin", 0, 24 * 60, 0),
    buffer_after_min: toNumber(formData, "bufferAfterMin", 0, 24 * 60, 0),
    min_notice_min: toNumber(formData, "minNoticeMin", 0, 30 * 24 * 60, 1440),
    max_booking_window_days: toNumber(formData, "maxBookingWindowDays", 1, 365, 90),
    active: formData.get("active") === "1",
    sort_order: int(formData, "sortOrder", 0),
  });

  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/dashboard/services");
  redirect("/dashboard/services");
}

/** Owner/admin-only: update a service. */
export async function updateServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and administrators can manage services." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing service id." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Service name is required." };

  const locationType = String(formData.get("locationType") ?? "in-person");
  if (!LOCATION_TYPES.includes(locationType as (typeof LOCATION_TYPES)[number])) {
    return { error: "Choose a valid location type." };
  }

  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = priceRaw === "" ? null : Number(priceRaw);
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    return { error: "Price must be a positive number, or leave it blank." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      duration_min: toNumber(formData, "durationMin", 5, 24 * 60, 30),
      price,
      currency: String(formData.get("currency") ?? "CAD").trim() || "CAD",
      location_type: locationType,
      location_details: String(formData.get("locationDetails") ?? "").trim() || null,
      booking_enabled: formData.get("bookingEnabled") === "1",
      buffer_before_min: toNumber(formData, "bufferBeforeMin", 0, 24 * 60, 0),
      buffer_after_min: toNumber(formData, "bufferAfterMin", 0, 24 * 60, 0),
      min_notice_min: toNumber(formData, "minNoticeMin", 0, 30 * 24 * 60, 1440),
      max_booking_window_days: toNumber(formData, "maxBookingWindowDays", 1, 365, 90),
      active: formData.get("active") === "1",
      sort_order: int(formData, "sortOrder", 0),
    })
    .eq("id", id)
    .eq("organization_id", ctx.org.id);

  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/dashboard/services");
  redirect("/dashboard/services");
}

/** Owner/admin-only: delete a service. */
export async function deleteServiceAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx) return;
  if (ctx.role !== "owner" && ctx.role !== "admin") return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("services").delete().eq("id", id).eq("organization_id", ctx.org.id);
  revalidatePath("/dashboard/services");
}

function friendlyDbError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You don't have permission to manage services.";
  }
  if (/duplicate key|unique/i.test(message)) {
    return "A service with that name already exists.";
  }
  return "Something went wrong saving the service. Please try again.";
}