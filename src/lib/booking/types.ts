/** M4 booking domain types (shared across dashboard + public surfaces). */

export type AppointmentStatus =
  "Scheduled" | "Confirmed" | "Completed" | "Cancelled" | "No-show" | "Rescheduled";

export const BOOKABLE_STATUSES: AppointmentStatus[] = ["Scheduled", "Confirmed"];

export interface Appointment {
  id: string;
  organizationId: string;
  serviceId: string | null;
  contactId: string | null;
  leadId: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: AppointmentStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  notes: string | null;
  source: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  serviceName?: string | null;
}

export interface AvailabilityRule {
  id: string;
  organizationId: string;
  dayOfWeek: number; // 0 = Sunday (Postgres dow)
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  timezone: string;
  active: boolean;
}

export interface BlockedTime {
  id: string;
  organizationId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Client-facing appointment (from get_appointment_by_token) — own data only. */
export interface PublicAppointment {
  id: string;
  token: string;
  status: AppointmentStatus;
  serviceId: string | null;
  serviceName: string;
  orgName: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  notes: string | null;
  source: string;
  createdAt: string;
}
