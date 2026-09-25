const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The business region this product is built for (St. John's, UTC−3:30/−2:30). */
export const DEFAULT_TIME_ZONE = "America/St_Johns";

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value === "UTC" || value.includes("/");
  } catch {
    return false;
  }
}

/** Convert a datetime-local wall-clock value in an IANA zone to UTC. */
export function localDateTimeToUtc(value: string, timeZone: string): Date | null {
  const match = LOCAL_DATE_TIME_RE.exec(value);
  if (!match || !isValidTimeZone(timeZone)) return null;

  const [, year, month, day, hour, minute] = match;
  const wallClock = Date.UTC(+year, +month - 1, +day, +hour, +minute);
  const check = new Date(wallClock);
  if (
    check.getUTCFullYear() !== +year ||
    check.getUTCMonth() + 1 !== +month ||
    check.getUTCDate() !== +day ||
    check.getUTCHours() !== +hour ||
    check.getUTCMinutes() !== +minute
  ) {
    return null;
  }
  let instant = wallClock;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(
      parts.filter(({ type }) => type !== "literal").map(({ type, value: part }) => [type, part]),
    );
    const rendered = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour) === 24 ? 0 : Number(values.hour),
      Number(values.minute),
    );
    instant += wallClock - rendered;
  }

  const result = new Date(instant);
  if (Number.isNaN(result.getTime())) return null;
  return formatDateTimeInZone(result, timeZone) === value ? result : null;
}

/** Format a stored UTC timestamp for an IANA-zone datetime-local input. */
export function utcToLocalDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso || !isValidTimeZone(timeZone)) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateTimeInZone(date, timeZone);
}

/** Human-readable "Sep 25, 2026, 9:00 a.m." in a specific IANA zone. */
export function formatWhen(iso: string | null | undefined, timeZone: string): string {
  if (!iso || !isValidTimeZone(timeZone)) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/** Short date ("Sep 24, 2026") in a specific IANA zone. */
export function formatDateInZone(iso: string | null | undefined, timeZone: string): string {
  if (!iso || !isValidTimeZone(timeZone)) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function formatDateTimeInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour === "24" ? "00" : values.hour}:${values.minute}`;
}
