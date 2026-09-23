/** Public form domain constants (PRD §22). */

export const FORM_FIELD_TYPES = [
  "text",
  "email",
  "phone",
  "textarea",
  "dropdown",
  "multi_select",
  "checkbox",
  "date",
  "hidden",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Single line text",
  email: "Email",
  phone: "Phone",
  textarea: "Paragraph text",
  dropdown: "Dropdown",
  multi_select: "Multi-select",
  checkbox: "Checkbox",
  date: "Date",
  hidden: "Hidden (auto value)",
};

/** Types that need an `options` list (comma-separated in the builder UI). */
export const OPTION_BEARING_FIELD_TYPES: FormFieldType[] = ["dropdown", "multi_select"];