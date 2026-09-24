import { createClient } from "@/lib/supabase/server";
import type {
  Appointment,
  AvailabilityRule,
  BlockedTime,
  AppointmentStatus,
} from "@/lib/booking/types";

interface AppointmentRow {
  id: string;
  organization_id: string;
  service_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: AppointmentStatus;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  notes: string | null;
  source: string;
  token: string;
  created_at: string;
  updated_at: string;
  service: { name: string } | null;
}

function mapAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    serviceId: row.service_id,
    contactId: row.contact_id,
    leadId: row.lead_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    status: row.status,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    notes: row.notes,
    source: row.source,
    token: row.token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    serviceName: row.service?.name ?? null,
  };
}

function mapRule(row: Record<string, unknown>): AvailabilityRule {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    dayOfWeek: Number(row.day_of_week),
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    timezone: String(row.timezone),
    active: Boolean(row.active),
  };
}

function mapBlocked(row: Record<string, unknown>): BlockedTime {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    reason: (row.reason as string | null) ?? null,
  };
}

/** Appointments for the org, newest-last; joins service name. */
export async function listAppointments(orgId: string): Promise<Appointment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*, service:services(name)")
    .eq("organization_id", orgId)
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapAppointment(row as unknown as AppointmentRow));
}

/** Live (Scheduled/Confirmed) appointments starting at/after `from`, soonest first. */
export async function listUpcomingAppointments(
  orgId: string,
  from: string,
  statuses: AppointmentStatus[] = ["Scheduled", "Confirmed"],
): Promise<Appointment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*, service:services(name)")
    .eq("organization_id", orgId)
    .in("status", statuses)
    .gte("starts_at", from)
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map((row) => mapAppointment(row as unknown as AppointmentRow));
}

export async function listPastAppointmentsPage(
  orgId: string,
  before: string,
  page = 1,
  pageSize = 20,
): Promise<{ appointments: Appointment[]; totalPages: number }> {
  const supabase = await createClient();
  const currentPage = Math.max(1, page);
  const from = (currentPage - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("appointments")
    .select("*, service:services(name)", { count: "exact" })
    .eq("organization_id", orgId)
    .lt("starts_at", before)
    .order("starts_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return {
    appointments: (data ?? []).map((row) => mapAppointment(row as unknown as AppointmentRow)),
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}

export async function listAvailabilityRules(orgId: string): Promise<AvailabilityRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_rules")
    .select("*")
    .eq("organization_id", orgId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapRule(row as unknown as Record<string, unknown>));
}

export async function listBlockedTimes(orgId: string): Promise<BlockedTime[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blocked_times")
    .select("*")
    .eq("organization_id", orgId)
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapBlocked(row as unknown as Record<string, unknown>));
}

/** Count of live appointments with starts_at >= from (dashboard widget). */
export async function countUpcomingAppointments(orgId: string, from: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("status", ["Scheduled", "Confirmed"])
    .gte("starts_at", from);

  if (error) throw error;
  return count ?? 0;
}
