"use client";

import { useActionState, useState } from "react";
import { saveContactCustomValuesAction } from "@/lib/crm/actions";
import type { CrmState } from "@/lib/crm/actions";
import { CustomFieldControl } from "./custom-field-control";
import type { CustomField } from "@/lib/crm/types";
import { Button } from "@/components/ui/button";

/** Inline editor for a contact's custom field values (PRD §12, §45). */
export function CustomValuesForm({
  contactId,
  fields,
  values,
}: {
  contactId: string;
  fields: CustomField[];
  values: Record<string, unknown>;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...values }));

  const buildPayload = () => {
    const payload = new FormData();
    payload.set("contactId", contactId);
    payload.set("customValuesJson", JSON.stringify(draft));
    return payload;
  };

  const [state, formAction, pending] = useActionState<CrmState, FormData>(
    async (prev, formData) => {
      void formData; // payload is rebuilt from current draft state
      return saveContactCustomValuesAction(prev, buildPayload());
    },
    {},
  );

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No custom fields configured yet. Owners can add them under{" "}
        <span className="font-medium">Settings → Custom fields</span>.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <CustomFieldControl
            key={field.id}
            field={field}
            value={draft[field.fieldKey]}
            onChange={(value) => setDraft((d) => ({ ...d, [field.fieldKey]: value }))}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          Save fields
        </Button>
        {state?.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : state?.success ? (
          <p className="text-sm text-primary">{state.success}</p>
        ) : null}
      </div>
    </form>
  );
}
