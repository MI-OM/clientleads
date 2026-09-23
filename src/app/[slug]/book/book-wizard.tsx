"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDuration, formatPrice, locationShort } from "@/lib/public/format";
import type { PublicService } from "@/lib/public/types";
import { SlotPicker } from "./slot-picker";
import { bookAppointmentAction, type BookState } from "./actions";

const initialState: BookState = {};

function formatWhen(iso: string, timezone: string): string {
  const d = new Date(iso);
  try {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(d);
    const time = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
    return `${date} at ${time}`;
  } catch {
    return d.toLocaleString();
  }
}

export function BookWizard({
  slug,
  orgName,
  services,
  timezone,
  initialServiceId,
}: {
  slug: string;
  orgName: string;
  services: PublicService[];
  timezone: string;
  initialServiceId: string | null;
}) {
  const [serviceId, setServiceId] = useState<string>(initialServiceId ?? services[0]?.id ?? "");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(bookAppointmentAction, initialState);

  const service = services.find((s) => s.id === serviceId);
  const multiple = services.length > 1;

  if (state.booked) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto size-12 text-green-600" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">You&apos;re booked!</h1>
        <p className="mt-2 text-muted-foreground">
          {state.booked.serviceName} · {formatWhen(state.booked.startsAt, timezone)} ({timezone})
        </p>
        <div className="mt-6 rounded-lg border border-border bg-card p-5 text-left">
          <p className="text-sm text-muted-foreground">
            Keep this link to manage your booking — reschedule or cancel anytime:
          </p>
          <a
            href={state.booked.manageUrl}
            className="mt-2 block break-all text-sm text-primary underline underline-offset-4"
          >
            {state.booked.manageUrl}
          </a>
          <p className="mt-3 text-sm text-muted-foreground">
            A confirmation email is on its way. See you then!
          </p>
        </div>
        <Link
          href={`/${slug}`}
          className="mt-6 inline-block text-sm text-primary underline underline-offset-4"
        >
          ← Back to {orgName}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link
        href={`/${slug}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        ← {orgName}
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Book an appointment</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a service, a time, and your details — it takes under a minute.
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-8">
        {/* Honeypot — hidden from real visitors. */}
        <input
          type="text"
          name="company_website"
          value=""
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden
        />

        {multiple ? (
          <section>
            <h2 className="text-lg font-semibold">1 · Choose a service</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {services.map((s) => {
                const active = s.id === serviceId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setServiceId(s.id);
                      setSelectedSlot(null);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors",
                      active
                        ? "border-primary ring-2 ring-ring"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-sm font-medium">
                        {formatPrice(s.price, s.currency) ?? "Pricing on request"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" aria-hidden /> {formatDuration(s.duration_min)}
                      </span>
                      <span>{locationShort(s.location_type)}</span>
                    </div>
                    {s.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {service ? (
          <section>
            <h2 className="text-lg font-semibold">
              {multiple ? "2 · Choose a time" : "Choose a time"}
            </h2>
            {multiple ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {service.name} · {formatDuration(service.duration_min)}
              </p>
            ) : null}
            <div className="mt-3">
              <SlotPicker
                slug={slug}
                serviceId={service.id}
                timezone={timezone}
                selected={selectedSlot}
                onSelect={setSelectedSlot}
              />
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="text-lg font-semibold">
            {multiple ? "3 · Your details" : "Your details"}
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-name">Full name</Label>
              <Input id="bk-name" name="name" required autoComplete="name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-email">Email</Label>
              <Input id="bk-email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-phone">Phone (optional)</Label>
              <Input id="bk-phone" name="phone" autoComplete="tel" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="bk-notes">Anything we should know? (optional)</Label>
              <Textarea id="bk-notes" name="notes" rows={3} />
            </div>
          </div>

          {state.error ? (
            <p className="mt-3 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="serviceId" value={service?.id ?? ""} />
          <input type="hidden" name="startsAt" value={selectedSlot ?? ""} />

          <div className="mt-5 flex flex-col gap-2">
            <Button type="submit" size="lg" disabled={pending || !service || !selectedSlot}>
              {pending ? "Booking…" : "Confirm booking"}
            </Button>
            {service && selectedSlot ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Info className="size-3.5" aria-hidden />
                {service.name} · {formatWhen(selectedSlot, timezone)} ({timezone})
              </p>
            ) : null}
          </div>
        </section>
      </form>
    </div>
  );
}
