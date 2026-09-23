"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarX2, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicAppointment, AppointmentStatus } from "@/lib/booking/types";
import { SlotPicker } from "../slot-picker";
import { cancelBookingAction, rescheduleBookingAction, type ManageState } from "./actions";

const initialState: ManageState = {};

const STATUS_VARIANT: Record<AppointmentStatus, "default" | "secondary" | "outline" | "danger"> = {
  Scheduled: "secondary",
  Confirmed: "default",
  Rescheduled: "secondary",
  Completed: "outline",
  Cancelled: "danger",
  "No-show": "danger",
};

function formatWhen(startsAt: string, endsAt: string, timezone: string): string {
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
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
    return `${date} · ${times} (${timezone})`;
  } catch {
    return `${new Date(startsAt).toLocaleString()} – ${new Date(endsAt).toLocaleString()}`;
  }
}

const LIVE = ["Scheduled", "Confirmed", "Rescheduled"];

export function ManagePanel({
  slug,
  appointment,
}: {
  slug: string;
  appointment: PublicAppointment;
}) {
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelBookingAction,
    initialState,
  );
  const [reschedState, reschedAction, reschedPending] = useActionState(
    rescheduleBookingAction,
    initialState,
  );
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [pickedSlot, setPickedSlot] = useState<string | null>(null);

  const isLive = LIVE.includes(appointment.status);
  const cancelled = cancelState.ok && cancelState.status === "Cancelled";
  const effectiveStatus: AppointmentStatus = cancelled
    ? "Cancelled"
    : reschedState.ok
      ? "Rescheduled"
      : appointment.status;
  const effectiveStarts =
    reschedState.ok && reschedState.startsAt ? reschedState.startsAt : appointment.startsAt;
  const effectiveEnds =
    reschedState.ok && reschedState.endsAt ? reschedState.endsAt : appointment.endsAt;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link
        href={`/${slug}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        ← {appointment.orgName ?? slug}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{appointment.serviceName}</h1>
        <Badge variant={STATUS_VARIANT[effectiveStatus]}>{effectiveStatus}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Managed booking (secure link)</p>

      <div className="mt-6 flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="flex items-center gap-2 font-medium">
            <CalendarClock className="size-4 text-primary" aria-hidden />
            {formatWhen(effectiveStarts, effectiveEnds, appointment.timezone)}
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{appointment.customerName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{appointment.customerEmail}</dd>
            </div>
            {appointment.customerPhone ? (
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{appointment.customerPhone}</dd>
              </div>
            ) : null}
            {appointment.notes ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="italic">{appointment.notes}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {isLive && !cancelled ? (
          <>
            {/* Reschedule */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <CalendarClock className="size-4 text-primary" aria-hidden /> Reschedule
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Move this booking to another open time.
              </p>
              <div className="mt-4">
                {appointment.serviceId ? (
                  <SlotPicker
                    slug={slug}
                    serviceId={appointment.serviceId}
                    timezone={appointment.timezone}
                    selected={pickedSlot}
                    onSelect={setPickedSlot}
                  />
                ) : null}
              </div>
              {reschedState.error ? (
                <p className="mt-3 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {reschedState.error}
                </p>
              ) : null}
              <form action={reschedAction} className="mt-4 flex flex-col items-start gap-2">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="token" value={appointment.token} />
                <input type="hidden" name="newStarts" value={pickedSlot ?? ""} />
                <Button type="submit" disabled={reschedPending || !pickedSlot}>
                  {reschedPending ? "Rescheduling…" : "Confirm new time"}
                </Button>
                {reschedState.ok ? (
                  <p className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckCircle2 className="size-4" aria-hidden /> Rescheduled!
                  </p>
                ) : null}
              </form>
            </div>

            {/* Cancel */}
            <div className="rounded-lg border border-destructive/30 bg-card p-5">
              <h2 className="flex items-center gap-2 font-semibold text-destructive">
                <CalendarX2 className="size-4" aria-hidden /> Cancel booking
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This frees the time for others. It can&apos;t be undone.
              </p>
              {cancelState.error ? (
                <p className="mt-3 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {cancelState.error}
                </p>
              ) : null}
              <form action={cancelAction} className="mt-4 flex items-center gap-2">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="token" value={appointment.token} />
                {confirmingCancel ? (
                  <>
                    <Button type="submit" variant="destructive" disabled={cancelPending}>
                      {cancelPending ? "Cancelling…" : "Yes, cancel it"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmingCancel(false)}
                    >
                      Keep it
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmingCancel(true)}
                  >
                    Cancel booking
                  </Button>
                )}
              </form>
            </div>
          </>
        ) : effectiveStatus === "Cancelled" ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <CalendarX2 className="size-4" aria-hidden /> This booking was cancelled
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The time has been freed up. Want to book another slot?
            </p>
            <Link
              href={`/${slug}/book`}
              className="mt-3 inline-block text-sm text-primary underline underline-offset-4"
            >
              Book a new appointment
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="size-4" aria-hidden /> This booking is{" "}
              {effectiveStatus.toLowerCase()}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
