import { createClient } from "@/lib/supabase/server";

export interface Service {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number | null;
  currency: string;
  locationType: string;
  locationDetails: string | null;
  bookingEnabled: boolean;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxBookingWindowDays: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface ServiceRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number | null;
  currency: string;
  location_type: string;
  location_details: string | null;
  booking_enabled: boolean;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  max_booking_window_days: number;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapService(row: ServiceRow): Service {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    durationMin: row.duration_min,
    price: row.price,
    currency: row.currency,
    locationType: row.location_type,
    locationDetails: row.location_details,
    bookingEnabled: row.booking_enabled,
    bufferBeforeMin: row.buffer_before_min,
    bufferAfterMin: row.buffer_after_min,
    minNoticeMin: row.min_notice_min,
    maxBookingWindowDays: row.max_booking_window_days,
    active: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Active + inactive services, sorted for display (owners use all rows). */
export async function listServices(orgId: string): Promise<Service[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapService(row as unknown as ServiceRow));
}

export async function getService(orgId: string, id: string): Promise<Service | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapService(data as unknown as ServiceRow) : null;
}