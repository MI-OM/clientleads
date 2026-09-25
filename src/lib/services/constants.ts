/** Services domain constants (PRD §16). */

export const LOCATION_TYPES = ["in-person", "phone", "video", "other"] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  "in-person": "In person",
  phone: "Phone",
  video: "Video",
  other: "Other",
};

export const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD"] as const;
