/**
 * Formatting helpers for public-facing prices, durations and locations.
 */

export function formatPrice(price: number | null, currency: string): string | null {
  if (price === null || price === undefined) return null;
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency || "CAD",
      maximumFractionDigits: price % 1 === 0 ? 0 : 2,
    }).format(price);
  } catch {
    return `${currency ?? ""} ${price}`.trim();
  }
}

export function formatDuration(min: number | null | undefined): string {
  if (!min || min <= 0) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

const LOCATION_LABELS: Record<string, string> = {
  "in-person": "In person",
  phone: "By phone",
  video: "Video call",
  other: "Other",
};

export function locationLabel(locationType: string): string {
  return LOCATION_LABELS[locationType] ?? locationType;
}

export function locationShort(locationType: string): string {
  switch (locationType) {
    case "phone":
      return "Phone";
    case "video":
      return "Video";
    case "in-person":
      return "In person";
    default:
      return "Other";
  }
}