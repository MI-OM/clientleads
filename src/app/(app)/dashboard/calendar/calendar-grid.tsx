"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * M8 — merged month calendar grid (appointments + imported events +
 * blocked times). Pure CSS, no deps: deterministic for a given `month` +
 * `timezone`. The server passes only serializable rows scoped to the
 * displayed window.
 */

export interface CalendarGridProps {
  appointments: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    serviceName: string | null;
    customerName: string;
    status: string;
  }>;
  events: Array<{
    id: string;
    provider: string;
    title: string;
    startsAt: string;
    endsAt: string;
  }>;
  blocked: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
  }>;
  timezone: string;
  /** YYYY-MM */
  month: string;
  baseHref: string;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

interface DayItem {
  key: string;
  title: string;
  time: string;
  provider?: string;
}

function hourMinute(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return (new Date(iso).toISOString().slice(11, 16) || "").slice(0, 5);
  }
}

function dayKeyOf(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function isoDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1 + delta, 1);
  if (Number.isNaN(d.getTime())) return month;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function CalendarGrid({
  appointments,
  events,
  blocked,
  timezone,
  month,
  baseHref,
}: CalendarGridProps) {
  const [year, monthIndexRaw] = month.split("-").map(Number);
  const monthIndex = (monthIndexRaw ?? 1) - 1;

  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = 42; // 6 weeks × 7 columns

  // ── bucket items by the org-timezone day they start on ────────────────
  const byDay = new Map<string, { apps: DayItem[]; imported: DayItem[]; blocked: DayItem[] }>();
  function addItem(day: string, kind: "apps" | "imported" | "blocked", item: DayItem) {
    const bucket = byDay.get(day) ?? { apps: [], imported: [], blocked: [] };
    bucket[kind].push(item);
    byDay.set(day, bucket);
  }

  for (const appt of appointments) {
    addItem(dayKeyOf(appt.startsAt, timezone), "apps", {
      key: appt.id,
      title: appt.serviceName ?? (appt.customerName || appt.status),
      time: hourMinute(appt.startsAt, timezone),
    });
  }
  for (const event of events) {
    addItem(dayKeyOf(event.startsAt, timezone), "imported", {
      key: event.id,
      title: event.title,
      time: hourMinute(event.startsAt, timezone),
      provider: event.provider,
    });
  }
  for (const block of blocked) {
    addItem(dayKeyOf(block.startsAt, timezone), "blocked", {
      key: block.id,
      title: block.reason ?? "Blocked",
      time: hourMinute(block.startsAt, timezone),
    });
  }

  const anyItems = appointments.length + events.length + blocked.length > 0;

  const monthTitle = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const cells = Array.from({ length: totalCells }, (_, index) => {
    const offset = index - firstWeekday;
    const date = new Date(year, monthIndex, 1 + offset);
    const inMonth = index >= firstWeekday && index < firstWeekday + daysInMonth;
    const day = isoDayKey(date);
    const bucket = byDay.get(day);

    const chips: {
      kind: "app" | "event" | "blocked";
      provider?: string;
      title: string;
      time: string;
    }[] = [];
    const push = (kind: "app" | "event" | "blocked", list?: DayItem[]) => {
      const items = (list ?? []).slice(0, Math.max(0, MAX_CHIPS_PER_DAY - chips.length));
      for (const item of items)
        chips.push({ kind, title: item.title, time: item.time, provider: item.provider });
    };
    push("app", bucket?.apps);
    push("event", bucket?.imported);
    push("blocked", bucket?.blocked);
    const overflow = Math.max(
      0,
      (bucket?.apps.length ?? 0) +
        (bucket?.imported.length ?? 0) +
        (bucket?.blocked.length ?? 0) -
        MAX_CHIPS_PER_DAY,
    );

    return { day, date, inMonth, chips, overflow };
  });

  return (
    <div className="flex flex-col gap-4">
      {/* month navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={`${baseHref}?month=${shiftMonth(month, -1)}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" aria-hidden /> Prev
        </Link>
        <h2 className="text-base font-semibold">{monthTitle}</h2>
        <Link
          href={`${baseHref}?month=${shiftMonth(month, 1)}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          aria-label="Next month"
        >
          Next <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      {anyItems ? (
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="border-b border-r border-border bg-muted/40 px-2 py-1.5 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground last:border-r-0"
            >
              {label}
            </div>
          ))}
          {cells.map((cell) => (
            <div
              key={cell.day}
              className={`flex min-h-20 flex-col gap-1 border-b border-r border-border p-1.5 last:border-r-0 ${
                cell.inMonth ? "" : "bg-muted/20"
              }`}
            >
              <span
                className={`text-xs font-medium ${
                  cell.inMonth
                    ? cell.date.getDate() === new Date().getDate() &&
                      cell.date.getMonth() === new Date().getMonth() &&
                      cell.date.getFullYear() === new Date().getFullYear()
                      ? "text-primary"
                      : "text-foreground"
                    : "text-muted-foreground/60"
                }`}
              >
                {cell.date.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {cell.chips.map((chip, i) => {
                  const variantClass = chipClass(chip.kind, cell.inMonth, chip.provider);
                  return (
                    <span
                      key={`${cell.day}-${chip.kind}-${i}`}
                      className={`truncate rounded border px-1 py-0.5 text-[11px] leading-tight ${variantClass}`}
                      title={`${chip.time} ${chip.title}`}
                    >
                      <span className="font-medium">{chip.time}</span> {chip.title}
                    </span>
                  );
                })}
                {cell.overflow > 0 ? (
                  <span className="px-1 text-[11px] text-muted-foreground">
                    +{cell.overflow} more
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border py-10 text-center">
          <CalendarDays className="size-8 text-muted-foreground/50" aria-hidden />
          <p className="font-medium">Nothing scheduled this month</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Connect Google Calendar or Calendly above and import events, then this grid fills in
            with appointments, imported events and blocked times.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary/60" aria-hidden /> Appointments
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-teal-500/60" aria-hidden /> Google Calendar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500/60" aria-hidden /> Calendly
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden /> Blocked
        </span>
      </div>
    </div>
  );
}

function chipClass(kind: "app" | "event" | "blocked", inMonth: boolean, provider?: string): string {
  if (kind === "app") return "border-primary/20 bg-primary/10 text-primary";
  if (kind === "event")
    return provider === "calendly"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-800"
      : "border-teal-500/25 bg-teal-500/10 text-teal-800";
  if (kind === "blocked")
    return inMonth
      ? "border-border bg-muted text-muted-foreground line-through"
      : "border-border bg-muted/40 text-muted-foreground/60 line-through";
  return "";
}
