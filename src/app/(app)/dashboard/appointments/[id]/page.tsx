import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, Phone, User } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { getAppointment } from "@/lib/booking/queries";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";
import type { AppointmentStatus } from "@/lib/booking/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setAppointmentStatusAction } from "../actions";

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

const ACTION_LABEL: Partial<Record<AppointmentStatus, string>> = {
  Cancelled: "Cancel",
  Completed: "Complete",
};

function formatWhen(startsAt: string, endsAt: string, timezone: string): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(startsAt));
  const time = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
  const endTime = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(endsAt));
  return `${date} · ${time}–${endTime}`;
}

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getMyOrg();
  const { id } = await params;
  if (!ctx) notFound();

  const appointment = await getAppointment(ctx.org.id, id);
  if (!appointment) notFound();

  const timezone = ctx.org.timezone ?? DEFAULT_TIME_ZONE;
  const canManage = ctx.role === "owner" || ctx.role === "admin";
  const actions = (canManage ? STATUS_ACTIONS[appointment.status] : undefined) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={appointment.serviceName ?? "Appointment"}
        description={formatWhen(appointment.startsAt, appointment.endsAt, timezone)}
        actions={
          <>
            {actions.map((status) => (
              <form key={status} action={setAppointmentStatusAction}>
                <input type="hidden" name="id" value={appointment.id} />
                <input type="hidden" name="status" value={status} />
                <button
                  type="submit"
                  className={buttonVariants({
                    variant: status === "Cancelled" ? "ghost" : "outline",
                  })}
                >
                  {ACTION_LABEL[status] ?? status}
                </button>
              </form>
            ))}
            <Link href="/dashboard/appointments" className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft className="size-4" aria-hidden /> All appointments
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd>
                  {appointment.contactId ? (
                    <Link
                      href={`/dashboard/contacts/${appointment.contactId}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <User className="size-3.5" aria-hidden />
                      {appointment.customerName}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <User className="size-3.5" aria-hidden />
                      {appointment.customerName}
                    </span>
                  )}
                </dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd>
                  <a
                    href={`mailto:${appointment.customerEmail}`}
                    className="text-primary hover:underline"
                  >
                    <Mail className="mr-1 inline size-3.5" aria-hidden />
                    {appointment.customerEmail}
                  </a>
                </dd>
                {appointment.customerPhone ? (
                  <>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>
                      <a href={`tel:${appointment.customerPhone}`} className="hover:underline">
                        <Phone className="mr-1 inline size-3.5" aria-hidden />
                        {appointment.customerPhone}
                      </a>
                    </dd>
                  </>
                ) : null}
                {appointment.leadId ? (
                  <>
                    <dt className="text-muted-foreground">Lead</dt>
                    <dd>
                      <Link
                        href={`/dashboard/leads/${appointment.leadId}`}
                        className="text-primary hover:underline"
                      >
                        View lead
                      </Link>
                    </dd>
                  </>
                ) : null}
              </dl>
              {appointment.notes ? (
                <div className="mt-4 rounded-md bg-muted/60 p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{appointment.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={STATUS_VARIANT[appointment.status]}>{appointment.status}</Badge>
                </dd>
                <dt className="text-muted-foreground">Service</dt>
                <dd>{appointment.serviceName ?? "—"}</dd>
                <dt className="text-muted-foreground">Starts</dt>
                <dd className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {formatWhen(appointment.startsAt, appointment.startsAt, timezone)}
                </dd>
                <dt className="text-muted-foreground">Ends</dt>
                <dd>{formatWhen(appointment.endsAt, appointment.endsAt, timezone)}</dd>
                <dt className="text-muted-foreground">Timezone</dt>
                <dd>{appointment.timezone}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd>{appointment.source}</dd>
                <dt className="text-muted-foreground">Booked</dt>
                <dd>
                  {new Date(appointment.createdAt).toLocaleString("en-CA", { timeZone: timezone })}
                </dd>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
