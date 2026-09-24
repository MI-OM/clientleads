"use client";

import { useState, useActionState } from "react";
import type { Org } from "@/lib/auth/org";
import { updateOrganizationAction, uploadLogoAction } from "./actions";
import type { SettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DEFAULT_TIMEZONE = "America/Halifax";
const TIMEZONES = [
  DEFAULT_TIMEZONE,
  ...(typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone").filter((tz) => tz !== DEFAULT_TIMEZONE)
    : []),
];

const SOCIAL_FIELDS: Array<{ key: string; label: string }> = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X (Twitter)" },
  { key: "youtube", label: "YouTube" },
];

function FormStatus({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-sm text-primary">
        {state.success}
      </p>
    );
  }
  return null;
}

function ColorField({
  id,
  label,
  defaultValue,
  disabled,
}: {
  id: string;
  label: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  const [hex, setHex] = useState(defaultValue);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          name={id}
          type="color"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          disabled={disabled}
          className="h-10 w-12 cursor-pointer rounded-md border border-input bg-card p-1"
        />
        <Input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          disabled={disabled}
          className="font-mono"
          aria-label={`${label} hex value`}
        />
      </div>
    </div>
  );
}

export function BusinessSettingsForm({ org, canEdit }: { org: Org; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateOrganizationAction,
    {},
  );
  const [logoState, logoAction, logoPending] = useActionState<SettingsState, FormData>(
    uploadLogoAction,
    {},
  );

  return (
    <div className="space-y-6">
      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Shown on the dashboard and your public business page. Images up to 10 MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logoUrl}
              alt={`${org.name} logo`}
              className="h-16 w-16 rounded-md border border-border object-contain bg-white p-1"
            />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">
              No logo
            </span>
          )}
          <form action={logoAction} className="flex flex-1 flex-col gap-3">
            <Input
              type="file"
              name="logo"
              accept="image/*"
              disabled={!canEdit}
              aria-label="Upload logo"
            />
            {logoState.error || logoState.success ? <FormStatus state={logoState} /> : null}
            <div>
              <Button type="submit" loading={logoPending} disabled={!canEdit} size="sm">
                Upload logo
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Business profile */}
      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>
            Contact details that appear on your public page and in emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={org.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="name">Business name</Label>
                <Input id="name" name="name" defaultValue={org.name} disabled={!canEdit} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">Web address</Label>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={org.slug}
                  disabled={!canEdit}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  required
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={org.description ?? ""}
                disabled={!canEdit}
                placeholder="Tell visitors what your business does…"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="about">About your business</Label>
              <Textarea
                id="about"
                name="about"
                defaultValue={org.about ?? ""}
                disabled={!canEdit}
                placeholder="Share your story, approach, and what makes your business different…"
              />
              <p className="text-xs text-muted-foreground">
                This appears in the About section of your public page, separately from the hero
                description.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={org.email ?? ""}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={org.phone ?? ""}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="websiteUrl">Website</Label>
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  type="url"
                  defaultValue={org.websiteUrl ?? ""}
                  disabled={!canEdit}
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="address">Street address</Label>
                <Input
                  id="address"
                  name="address"
                  defaultValue={org.address ?? ""}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" defaultValue={org.city ?? ""} disabled={!canEdit} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="province">Province / State</Label>
                <Input
                  id="province"
                  name="province"
                  defaultValue={org.province ?? ""}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  name="country"
                  defaultValue={org.country ?? ""}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="postalCode">Postal / ZIP code</Label>
                <Input
                  id="postalCode"
                  name="postalCode"
                  defaultValue={org.postalCode ?? ""}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  id="timezone"
                  name="timezone"
                  defaultValue={org.timezone}
                  disabled={!canEdit}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </div>
              <ColorField
                id="primaryColor"
                label="Primary color"
                defaultValue={org.primaryColor}
                disabled={!canEdit}
              />
              <ColorField
                id="secondaryColor"
                label="Secondary color"
                defaultValue={org.secondaryColor}
                disabled={!canEdit}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {SOCIAL_FIELDS.map((field) => (
                <div className="grid gap-2" key={field.key}>
                  <Label htmlFor={`social_${field.key}`}>{field.label}</Label>
                  <Input
                    id={`social_${field.key}`}
                    name={`social_${field.key}`}
                    type="url"
                    defaultValue={org.socialLinks[field.key] ?? ""}
                    disabled={!canEdit}
                  />
                </div>
              ))}
            </div>

            <FormStatus state={state} />

            {canEdit ? (
              <div>
                <Button type="submit" loading={pending}>
                  Save changes
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only owners and administrators can edit business settings.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
