import Link from "next/link";
import { CalendarOff, CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyOrg } from "@/lib/auth/org";
import { listAppointments } from "@/lib/booking/queries";
import type { Appointment, AppointmentStatus } from "@/lib/booking/types";
import { setAppointmentStatusAction } from "./actions";

const STATUS_VARIANT: Record<AppointmentStatus, "default" | "secondary" | "outline" | "danger"> = {
  Scheduled: "secondary",
  Confirmed: "default",
  Rescheduled: "secondary",
  Completed: "outline",
  Cancelled: "danger",
  "No-show": "danger",
};

const STATUS_ACTIONS: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
  Scheduled: ["Confirmed", "Cancelled"],
  Rescheduled: ["Confirmed", "Cancelled"],
  Confirmed: ["Completed", "Cancelled", "No-show"],
};

function formatWhen(startsAt: string, endsAt: string, timezone: string): string {
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(start);
    const times = `${new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(start)}–${new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(end)}`;
    return `${date} · ${times}`;
  } catch {
    return new Date(startsAt).toLocaleString();
  }
}

function AppointmentRow({
  appointment,
  timezone,
  canManage,
}: {
  appointment: Appointment;
  timezone: string;
  canManage: boolean;
}) {
  const actions = STATUS_ACTIONS[appointment.status] ?? [];
  const live = !["Cancelled", "No-show", "Completed"].includes(appointment.status);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium">
          {formatWhen(appointment.startsAt, appointment.endsAt, timezone)}
          {live ? null : " · " + appointment.status}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {appointment.serviceName ?? "Appointment"}
          </span>
          {" · "}
          {appointment.customerName}
          {" · "}
          {appointment.customerEmail}
          {appointment.customerPhone ? ` · ${appointment.customerPhone}` : ""}
        </p>
        {appointment.notes ? (
          <p className="mt-0.5 truncate text-sm italic text-muted-foreground/80">
            “{appointment.notes}”
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[appointment.status]}>{appointment.status}</Badge>
        {canManage && actions.length > 0 ? (
          <div className="flex items-center gap-1">
            {actions.map((status) => (
              <form key={status} action={setAppointmentStatusAction}>
                <input type="hidden" name="id" value={appointment.id} />
                <input type="hidden" name="status" value={status} />
                <Button
                  type="submit"
                  variant={status === "Cancelled" ? "ghost" : "outline"}
                  size="sm"
                  className={
                    status === "Cancelled" ? "text-destructive hover:text-destructive" : ""
                  }
                >
                  {status === "Cancelled" ? "Cancel" : status === "Completed" ? "Complete" : status}
                </Button>
              </form>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default async function AppointmentsPage() {
  const ctx = await getMyOrg();
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";

  const appointments = ctx ? await listAppointments(ctx.org.id) : [];
  const now = new Date().toISOString();
  const upcoming = appointments
    .filter((a) => a.startsAt >= now && !["Cancelled", "No-show", "Completed"].includes(a.status))
    .slice(0, 25);
  const past = appointments
    .filter(
      (a) => !(a.startsAt >= now && !["Cancelled", "No-show", "Completed"].includes(a.status)),
    )
    .reverse()
    .slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Appointments"
        description="Bookings from your public page, and their status (PRD §19–21)."
        actions={
          <Link href="/dashboard/availability" className={buttonVariants({ variant: "outline" })}>
            <CalendarPlus className="size-4" aria-hidden /> Availability
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CalendarOff className="size-8 text-muted-foreground/50" aria-hidden />
              <p className="font-medium">No upcoming appointments</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Visitors book once a bookable service and availability windows exist. Try booking
                from your public page.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  timezone={ctx?.org.timezone ?? "UTC"}
                  canManage={canManage}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {past.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {past.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  timezone={ctx?.org.timezone ?? "UTC"}
                  canManage={canManage}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
