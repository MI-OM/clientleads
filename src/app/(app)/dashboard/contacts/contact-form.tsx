"use client";

import { useActionState, useState } from "react";
import { CONTACT_LEAD_STATUSES, CONTACT_TYPES, LEAD_SOURCES } from "@/lib/crm/constants";
import { createContactAction, updateContactAction } from "@/lib/crm/actions";
import type { CrmState } from "@/lib/crm/actions";
import type { Contact, CustomField, OrgMember, Tag } from "@/lib/crm/types";
import { CustomFieldControl } from "@/components/crm/custom-field-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function ContactForm({
  mode,
  fields,
  tags,
  members,
  initial,
}: {
  mode: "create" | "edit";
  fields: CustomField[];
  tags: Tag[];
  members: OrgMember[];
  initial?: Contact;
}) {
  const action = mode === "create" ? createContactAction : updateContactAction;
  const [state, formAction, pending] = useActionState<CrmState, FormData>(action, {});

  const [customValues, setCustomValues] = useState<Record<string, unknown>>(() => ({
    ...(initial?.customValues ?? {}),
  }));
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() =>
    (initial?.tags ?? [])
      .map((name) => tags.find((t) => t.name === name)?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const [marketingOptIn, setMarketingOptIn] = useState(initial?.marketingOptIn ?? true);

  return (
    <form action={formAction} className="space-y-6">
      {mode === "edit" && initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="customValuesJson" value={JSON.stringify(customValues)} readOnly />
      <input type="hidden" name="tagsJson" value={JSON.stringify(selectedTagIds)} readOnly />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" defaultValue={initial?.firstName} autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" defaultValue={initial?.lastName} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" name="company" defaultValue={initial?.company ?? ""} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contactType">Contact type</Label>
            <Select
              id="contactType"
              name="contactType"
              defaultValue={initial?.contactType ?? "Lead"}
            >
              {CONTACT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="leadStatus">Lead status</Label>
            <Select id="leadStatus" name="leadStatus" defaultValue={initial?.leadStatus ?? "New"}>
              {CONTACT_LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="source">Source</Label>
            <Select id="source" name="source" defaultValue={initial?.source ?? "Manual entry"}>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="assignedUserId">Assigned to</Label>
            <Select
              id="assignedUserId"
              name="assignedUserId"
              defaultValue={initial?.assignedUserId ?? ""}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName || "Unnamed member"}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="marketingOptIn"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="size-4 rounded border-input accent-[var(--primary)]"
            />
            Contact has opted in to marketing messages
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="address">Street address</Label>
            <Input id="address" name="address" defaultValue={initial?.address ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={initial?.city ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="province">Province / State</Label>
            <Input id="province" name="province" defaultValue={initial?.province ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="country">Country</Label>
            <Input id="country" name="country" defaultValue={initial?.country ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="postalCode">Postal / ZIP code</Label>
            <Input id="postalCode" name="postalCode" defaultValue={initial?.postalCode ?? ""} />
          </div>
        </CardContent>
      </Card>

      {fields.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom fields</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <CustomFieldControl
                key={field.id}
                field={field}
                value={customValues[field.fieldKey]}
                onChange={(value) => setCustomValues((c) => ({ ...c, [field.fieldKey]: value }))}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      setSelectedTagIds((ids) =>
                        selected ? ids.filter((id) => id !== tag.id) : [...ids, tag.id],
                      )
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tags yet — create some from the Contacts list.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {mode === "create" ? "Create contact" : "Save changes"}
        </Button>
        {state?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
