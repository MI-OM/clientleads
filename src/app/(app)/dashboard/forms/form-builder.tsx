"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { createFormAction, updateFormAction, type FormActionState } from "./actions";
import type { PublicForm, FormField } from "@/lib/forms/queries";
import {
  FORM_FIELD_TYPES,
  FORM_FIELD_TYPE_LABELS,
  OPTION_BEARING_FIELD_TYPES,
  type FormFieldType,
} from "@/lib/forms/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface FieldDraft {
  uid: string;
  label: string;
  fieldKey: string;
  fieldType: FormFieldType;
  required: boolean;
  options: string;
  placeholder: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function draftsFromFields(fields: FormField[]): FieldDraft[] {
  return fields.map((f) => ({
    uid: f.id,
    label: f.label,
    fieldKey: f.fieldKey,
    fieldType: f.fieldType as FormFieldType,
    required: f.required,
    options: (f.options ?? []).join(", "),
    placeholder: f.placeholder ?? "",
  }));
}

function serializeFields(fields: FieldDraft[]): string {
  return JSON.stringify(
    fields
      .filter((f) => f.label.trim() && f.fieldKey.trim())
      .map((f) => ({
        label: f.label.trim(),
        fieldKey: f.fieldKey.trim(),
        fieldType: f.fieldType,
        required: f.required,
        options: f.options,
        placeholder: f.placeholder.trim(),
      })),
  );
}

function FormStatus({ state }: { state: FormActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

interface FormBuilderProps {
  form?: PublicForm;
}

export function FormBuilder({ form }: FormBuilderProps) {
  const [state, formAction, pending] = useActionState<FormActionState, FormData>(
    form ? updateFormAction : createFormAction,
    {},
  );
  const [fields, setFields] = useState<FieldDraft[]>(() => draftsFromFields(form?.fields ?? []));

  function patch(index: number, patch: Partial<FieldDraft>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField(type: FormFieldType = "text") {
    setFields((prev) => [
      ...prev,
      {
        uid: uid(),
        label: "",
        fieldKey: "",
        fieldType: type,
        required: false,
        options: "",
        placeholder: "",
      },
    ]);
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {form ? <input type="hidden" name="id" value={form.id} /> : null}
      <input type="hidden" name="fields" value={serializeFields(fields)} readOnly />

      <Card>
        <CardHeader>
          <CardTitle>Form settings</CardTitle>
          <CardDescription>
            Shown on your public page. Active forms appear in the lead-form section.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Form name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={form?.name ?? ""}
                placeholder="e.g. Seller inquiry"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Web address</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={form?.slug ?? ""}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="e.g. seller-inquiry"
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={form?.description ?? ""}
                placeholder="A short line above the form…"
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="source">Lead source</Label>
              <Input
                id="source"
                name="source"
                defaultValue={form?.source ?? "Public website"}
                placeholder="e.g. Public website"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="active"
                  value="1"
                  defaultChecked={form?.active ?? true}
                  className="size-4 rounded border-input accent-[var(--primary)]"
                />
                Active — shown on my public page
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fields</CardTitle>
          <CardDescription>
            The questions visitors will answer. Email and phone are used to match or create the
            contact in your CRM.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {fields.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No fields yet — add your first field below.
            </p>
          ) : (
            fields.map((field, index) => (
              <div key={field.uid} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="grid gap-1.5 sm:col-span-4">
                    <Label className="text-xs" htmlFor={`label-${field.uid}`}>
                      Label
                    </Label>
                    <Input
                      id={`label-${field.uid}`}
                      value={field.label}
                      onChange={(e) => patch(index, { label: e.target.value })}
                      placeholder="Field label"
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-3">
                    <Label className="text-xs" htmlFor={`key-${field.uid}`}>
                      Field key
                    </Label>
                    <Input
                      id={`key-${field.uid}`}
                      value={field.fieldKey}
                      onChange={(e) =>
                        patch(index, {
                          fieldKey: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                        })
                      }
                      placeholder="e.g. message"
                      className="h-9 font-mono"
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-3">
                    <Label className="text-xs" htmlFor={`type-${field.uid}`}>
                      Type
                    </Label>
                    <Select
                      id={`type-${field.uid}`}
                      value={field.fieldType}
                      onChange={(e) => patch(index, { fieldType: e.target.value as FormFieldType })}
                      className="h-9"
                    >
                      {FORM_FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {FORM_FIELD_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-end justify-end gap-1 sm:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move field up"
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => move(index, 1)}
                      disabled={index === fields.length - 1}
                      aria-label="Move field down"
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
                      onClick={() => removeField(index)}
                      aria-label="Remove field"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-12">
                  {OPTION_BEARING_FIELD_TYPES.includes(field.fieldType) ? (
                    <div className="grid gap-1.5 sm:col-span-7">
                      <Label className="text-xs" htmlFor={`options-${field.uid}`}>
                        Options (comma separated)
                      </Label>
                      <Input
                        id={`options-${field.uid}`}
                        value={field.options}
                        onChange={(e) => patch(index, { options: e.target.value })}
                        placeholder="House, Condo, Townhouse"
                        className="h-9"
                      />
                    </div>
                  ) : (
                    <div className="grid gap-1.5 sm:col-span-7">
                      <Label className="text-xs" htmlFor={`placeholder-${field.uid}`}>
                        Placeholder
                      </Label>
                      <Input
                        id={`placeholder-${field.uid}`}
                        value={field.placeholder}
                        onChange={(e) => patch(index, { placeholder: e.target.value })}
                        className="h-9"
                      />
                    </div>
                  )}
                  <div className="flex items-end gap-4 sm:col-span-5 sm:justify-end">
                    <label className="flex h-9 items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => patch(index, { required: e.target.checked })}
                        className="size-4 rounded border-input accent-[var(--primary)]"
                      />
                      Required
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {FORM_FIELD_TYPE_LABELS[field.fieldType]}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => addField("text")}>
              <Plus className="size-4" aria-hidden /> Add field
            </Button>
          </div>
        </CardContent>
      </Card>

      <FormStatus state={state} />
      <div>
        <Button type="submit" loading={pending}>
          {form ? "Save changes" : "Create form"}
        </Button>
      </div>
    </form>
  );
}
