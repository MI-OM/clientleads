const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

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
  return Number.isNaN(result.getTime()) ? null : result;
}
