import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublicAppointment, AppointmentStatus } from "@/lib/booking/types";
import { ManagePanel } from "./manage";

interface PageProps {
  params: Promise<{ slug: string; token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await params;
  return {
    title: "Manage your booking",
    description: "Reschedule or cancel your appointment.",
    robots: { index: false, follow: false },
  };
}

function mapAppointment(payload: unknown): PublicAppointment | null {
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p.id !== "string" || typeof p.token !== "string") return null;
  return {
    id: p.id,
    token: p.token,
    status: p.status as AppointmentStatus,
    serviceId: typeof p.service_id === "string" ? p.service_id : null,
    serviceName: String(p.service_name ?? "Appointment"),
    orgName: typeof p.org_name === "string" ? p.org_name : null,
    startsAt: String(p.starts_at),
    endsAt: String(p.ends_at),
    timezone: String(p.timezone),
    customerName: String(p.customer_name),
    customerEmail: String(p.customer_email),
    customerPhone: typeof p.customer_phone === "string" ? p.customer_phone : null,
    notes: typeof p.notes === "string" ? p.notes : null,
    source: String(p.source ?? ""),
    createdAt: String(p.created_at ?? ""),
  };
}

export default async function ManageBookingPage({ params }: PageProps) {
  const { slug, token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token) || !isSupabaseConfigured()) notFound();

  const client = createPublicClient();
  const { data, error } = await client.rpc("get_appointment_by_token", { p_token: token });
  const appointment = error ? null : mapAppointment(data);
  if (!appointment) notFound();

  return <ManagePanel slug={slug} appointment={appointment} />;
}
