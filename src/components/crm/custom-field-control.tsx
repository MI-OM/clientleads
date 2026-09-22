"use client";

import type { CustomField } from "@/lib/crm/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Renders the right input control for a custom field definition (PRD §12).
 * Value semantics: text→string, number→number, date→"YYYY-MM-DD",
 * boolean→boolean, dropdown→string, multi_select→string[].
 */
export function CustomFieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const controlId = `cf_${field.id}`;

  if (field.fieldType === "boolean") {
    return (
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <input
            id={controlId}
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 rounded border-input accent-[var(--primary)]"
          />
          <Label htmlFor={controlId} className="font-normal">
            {field.name}
          </Label>
        </div>
      </div>
    );
  }

  if (field.fieldType === "dropdown") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={controlId}>{field.name}</Label>
        <Select
          id={controlId}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  if (field.fieldType === "multi_select") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="grid gap-2">
        <Label>{field.name}</Label>
        <div className="flex flex-wrap gap-2">
          {field.options.map((option) => {
            const checked = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange(checked ? selected.filter((o) => o !== option) : [...selected, option])
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent",
                  disabled && "opacity-60",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const inputType =
    field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text";
  return (
    <div className="grid gap-2">
      <Label htmlFor={controlId}>{field.name}</Label>
      <Input
        id={controlId}
        type={inputType}
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onChange={(e) => {
          if (field.fieldType === "number") {
            onChange(e.target.value === "" ? undefined : Number(e.target.value));
          } else {
            onChange(e.target.value || undefined);
          }
        }}
        placeholder={field.fieldType === "date" ? "YYYY-MM-DD" : undefined}
      />
    </div>
  );
}
