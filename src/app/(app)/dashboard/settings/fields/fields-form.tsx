"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { CUSTOM_FIELD_TYPES } from "@/lib/crm/constants";
import { deleteCustomFieldAction, upsertCustomFieldAction } from "@/lib/crm/actions";
import type { CrmState } from "@/lib/crm/actions";
import type { CustomField } from "@/lib/crm/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / No",
  dropdown: "Dropdown",
  multi_select: "Multi-select",
};

export function CustomFieldsForm({
  fields,
  canManage,
}: {
  fields: CustomField[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [typeDraft, setTypeDraft] = useState<string>("text");
  const [state, formAction, pending] = useActionState<CrmState, FormData>(
    upsertCustomFieldAction,
    {},
  );

  const startEdit = (field: CustomField | null) => {
    setEditing(field);
    setTypeDraft(field?.fieldType ?? "text");
  };

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <p className="text-sm font-medium">Add or update a field</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Field name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={editing?.name ?? ""}
                placeholder="e.g. Preferred Area"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fieldKey">Field key (optional — auto-generated from name)</Label>
              <Input
                id="fieldKey"
                name="fieldKey"
                defaultValue={editing?.fieldKey ?? ""}
                placeholder="preferred_area"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fieldType">Type</Label>
              <Select
                id="fieldType"
                name="fieldType"
                value={typeDraft}
                onChange={(e) => setTypeDraft(e.target.value)}
              >
                {CUSTOM_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type] ?? type}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sortOrder">Sort order</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                defaultValue={editing?.sortOrder ?? 0}
              />
            </div>
            {typeDraft === "dropdown" || typeDraft === "multi_select" ? (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="options">Options (one per line)</Label>
                <Textarea
                  id="options"
                  name="options"
                  rows={4}
                  defaultValue={editing?.options.join("\n") ?? ""}
                  placeholder={"Condo\nHouse\nTownhouse"}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="required"
                  defaultChecked={editing?.required ?? false}
                  className="size-4 rounded border-input accent-[var(--primary)]"
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={editing?.isActive ?? true}
                  className="size-4 rounded border-input accent-[var(--primary)]"
                />
                Active
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" loading={pending}>
              {editing ? "Save field" : "Add field"}
            </Button>
            {editing ? (
              <Button type="button" variant="ghost" onClick={() => startEdit(null)}>
                Cancel
              </Button>
            ) : null}
            {state?.error ? (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : state?.success ? (
              <p role="status" className="text-sm text-primary">
                {state.success}
              </p>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only owners and administrators can manage custom fields.
        </p>
      )}

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No custom fields yet. Fields render on contact forms and detail pages without any schema
          change (PRD §12, §45).
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Required</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canManage ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{field.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {field.fieldKey}
                  </td>
                  <td className="px-4 py-3">{TYPE_LABELS[field.fieldType] ?? field.fieldType}</td>
                  <td className="px-4 py-3 text-muted-foreground">{field.sortOrder}</td>
                  <td className="px-4 py-3">
                    {field.required ? <Badge variant="secondary">Yes</Badge> : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {field.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(field)}
                          aria-label={`Edit ${field.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Delete "${field.name}"? Existing values are removed too.`,
                              )
                            )
                              return;
                            const result = await deleteCustomFieldAction(field.id);
                            if (result?.error) alert(result.error);
                            router.refresh();
                          }}
                          aria-label={`Delete ${field.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
