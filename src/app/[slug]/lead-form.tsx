"use client";

import { useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { submitFormAction, type PublicFormState } from "./actions";
import type { PublicForm, PublicFormField } from "@/lib/public/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function FieldInput({ field, namePrefix }: { field: PublicFormField; namePrefix: string }) {
  const name = `${namePrefix}${field.field_key}`;
  const required = field.required;
  const label = field.label;

  switch (field.field_type) {
    case "textarea":
      return (
        <div className="grid gap-1.5 sm:col-span-2">
          <label htmlFor={name} className="text-sm font-medium">
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </label>
          <Textarea
            id={name}
            name={name}
            required={required}
            placeholder={field.placeholder ?? ""}
            rows={4}
          />
        </div>
      );
    case "dropdown":
      return (
        <div className="grid gap-1.5">
          <label htmlFor={name} className="text-sm font-medium">
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </label>
          <Select id={name} name={name} required={required}>
            <option value="">{field.placeholder ?? "Select…"}</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      );
    case "multi_select": {
      const options = field.options ?? [];
      return (
        <div className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </span>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <label key={option} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  value={option}
                  className="size-4 rounded border-input accent-[var(--brand)]"
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      );
    }
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name={name}
            value="1"
            defaultChecked={false}
            className="size-4 rounded border-input accent-[var(--brand)]"
          />
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </label>
      );
    case "date":
      return (
        <div className="grid gap-1.5">
          <label htmlFor={name} className="text-sm font-medium">
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </label>
          <Input id={name} name={name} type="date" required={required} />
        </div>
      );
    case "hidden":
      return <input type="hidden" name={name} value="" />;
    default:
      return (
        <div className="grid gap-1.5">
          <label htmlFor={name} className="text-sm font-medium">
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </label>
          <Input
            id={name}
            name={name}
            type={
              field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "text"
            }
            required={required}
            placeholder={field.placeholder ?? ""}
            autoComplete={
              field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "name"
            }
          />
        </div>
      );
  }
}

interface LeadFormProps {
  form: PublicForm;
  pageSlug: string;
  serviceName?: string;
}

export function LeadForm({ form, pageSlug, serviceName }: LeadFormProps) {
  const [state, formAction, pending] = useActionState<PublicFormState, FormData>(
    submitFormAction,
    {},
  );

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--brand)]/30 bg-[color-mix(in_srgb,var(--brand)_6%,white)] p-8 text-center">
        <CheckCircle2 className="size-10 text-[var(--brand)]" aria-hidden />
        <p className="font-semibold">Message sent</p>
        <p className="text-sm text-muted-foreground">{state.success}</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="relative flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      {form.description ? (
        <p className="text-sm text-muted-foreground">{form.description}</p>
      ) : null}
      <input type="hidden" name="form_slug" value={form.slug} />
      <input type="hidden" name="page_slug" value={pageSlug} />
      {serviceName ? (
        <input type="hidden" name="field_service_requested" value={serviceName} />
      ) : null}
      {/* Honeypot — hidden from humans, irresistible to bots */}
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <label htmlFor="company_website">Leave this field empty</label>
        <input
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {form.fields.map((field) => (
          <FieldInput key={field.id} field={field} namePrefix="field_" />
        ))}
      </div>
      {serviceName ? (
        <div className="flex items-center gap-2 rounded-md border border-[var(--brand)]/25 bg-[color-mix(in_srgb,var(--brand)_6%,white)] px-3 py-2 text-sm">
          <span className="font-medium">Service requested:</span>
          <span className="text-muted-foreground">{serviceName}</span>
        </div>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div>
        <Button
          type="submit"
          loading={pending}
          className="w-full sm:w-auto"
          style={{ backgroundColor: "var(--brand)" }}
        >
          <Send className="size-4" aria-hidden /> Send message
        </Button>
      </div>
    </form>
  );
}
