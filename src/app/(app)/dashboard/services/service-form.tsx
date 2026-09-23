"use client";

import { useActionState } from "react";
import {
  createServiceAction,
  updateServiceAction,
  type ServiceActionState,
} from "./actions";
import type { Service } from "@/lib/services/queries";
import { CURRENCIES, LOCATION_TYPES, LOCATION_TYPE_LABELS } from "@/lib/services/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function FormStatus({ state }: { state: ServiceActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

interface ServiceFormProps {
  service?: Service;
}

export function ServiceForm({ service }: ServiceFormProps) {
  const [state, formAction, pending] = useActionState<ServiceActionState, FormData>(
    service ? updateServiceAction : createServiceAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {service ? <input type="hidden" name="id" value={service.id} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            What you offer and how much it costs. Active services appear on your public page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="name">Service name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={service?.name ?? ""}
                placeholder="e.g. Home buying consultation"
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={service?.description ?? ""}
                placeholder="What does this service include?"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="durationMin">Duration (minutes)</Label>
              <Input
                id="durationMin"
                name="durationMin"
                type="number"
                min={5}
                max={1440}
                defaultValue={service?.durationMin ?? 30}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sortOrder">Sort order</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                defaultValue={service?.sortOrder ?? 0}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min={0}
                step="0.01"
                defaultValue={service?.price ?? ""}
                placeholder="Leave blank for 'call for pricing'"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Select id="currency" name="currency" defaultValue={service?.currency ?? "CAD"}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="locationType">Location type</Label>
              <Select
                id="locationType"
                name="locationType"
                defaultValue={service?.locationType ?? "in-person"}
              >
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LOCATION_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="locationDetails">Location details</Label>
              <Input
                id="locationDetails"
                name="locationDetails"
                defaultValue={service?.locationDetails ?? ""}
                placeholder="e.g. Your office, or 123 Main St"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              value="1"
              defaultChecked={service?.active ?? true}
              className="size-4 rounded border-input accent-[var(--primary)]"
            />
            Active — listed on my public page
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking</CardTitle>
          <CardDescription>
            Enable online booking for this service. Booking availability arrives in M4; these
            settings are ready now.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="bookingEnabled"
              value="1"
              defaultChecked={service?.bookingEnabled ?? false}
              className="size-4 rounded border-input accent-[var(--primary)]"
            />
            Allow visitors to book this service online
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="bufferBeforeMin">Buffer before (minutes)</Label>
              <Input
                id="bufferBeforeMin"
                name="bufferBeforeMin"
                type="number"
                min={0}
                defaultValue={service?.bufferBeforeMin ?? 0}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bufferAfterMin">Buffer after (minutes)</Label>
              <Input
                id="bufferAfterMin"
                name="bufferAfterMin"
                type="number"
                min={0}
                defaultValue={service?.bufferAfterMin ?? 0}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="minNoticeMin">Minimum notice (minutes)</Label>
              <Input
                id="minNoticeMin"
                name="minNoticeMin"
                type="number"
                min={0}
                defaultValue={service?.minNoticeMin ?? 1440}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="maxBookingWindowDays">Max booking window (days)</Label>
              <Input
                id="maxBookingWindowDays"
                name="maxBookingWindowDays"
                type="number"
                min={1}
                defaultValue={service?.maxBookingWindowDays ?? 90}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <FormStatus state={state} />
      <div>
        <Button type="submit" loading={pending}>
          {service ? "Save changes" : "Create service"}
        </Button>
      </div>
    </form>
  );
}