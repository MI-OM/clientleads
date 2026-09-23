"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Local YYYY-MM-DD for a date in the visitor's own calendar. */
function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function dayLabel(key: string): { weekday: string; day: string } {
  const d = dateFromKey(key);
  return {
    weekday: new Intl.DateTimeFormat("en-CA", { weekday: "short" }).format(d),
    day: String(d.getDate()),
  };
}

function formatSlotTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
}

interface FetchResult {
  key: string; // `${serviceId}:${date}`
  slots: string[];
}

export interface SlotPickerProps {
  slug: string;
  serviceId: string;
  timezone: string;
  /** 30-day lookahead (services' max window is enforced server-side). */
  lookaheadDays?: number;
  selected: string | null;
  onSelect: (iso: string | null) => void;
}

/**
 * Day chips + time grid for one bookable service. Fetches available slots
 * through /api/public/slots (anon, get_available_slots) when the day or
 * service changes. Rendering uses the business timezone.
 */
export function SlotPicker({
  slug,
  serviceId,
  timezone,
  lookaheadDays = 30,
  selected,
  onSelect,
}: SlotPickerProps) {
  const dates = useMemo(() => {
    const out: string[] = [];
    const base = new Date();
    for (let i = 1; i <= lookaheadDays; i += 1) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      out.push(localKey(d));
    }
    return out;
  }, [lookaheadDays]);

  // Day is derived from state — null means "use the first day".
  const [date, setDate] = useState<string | null>(null);
  const activeDate = date ?? dates[0] ?? null;
  const fetchKey = `${serviceId}:${activeDate}`;
  const [result, setResult] = useState<FetchResult | null>(null);
  const loading = result?.key !== fetchKey;
  const slots = result?.key === fetchKey ? result.slots : [];

  useEffect(() => {
    if (!activeDate || !serviceId) return;
    const key = `${serviceId}:${activeDate}`;
    let cancelled = false;
    fetch(
      `/api/public/slots?slug=${encodeURIComponent(slug)}&service=${serviceId}&date=${activeDate}`,
    )
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setResult({ key, slots: Array.isArray(body?.slots) ? body.slots.map(String) : [] });
        onSelect(null); // target changed — the previously chosen slot is no longer valid
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ key, slots: [] });
        onSelect(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, serviceId, activeDate]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarDays className="size-4" aria-hidden />
        <span className="font-medium text-foreground">Pick a day</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {dates.map((key) => {
          const { weekday, day } = dayLabel(key);
          const active = activeDate === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setDate(key);
                onSelect(null);
              }}
              aria-pressed={active}
              className={cn(
                "flex min-w-14 flex-col items-center rounded-lg border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              <span className="text-xs opacity-80">{weekday}</span>
              <span className="font-semibold">{day}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="size-4" aria-hidden />
        <span className="font-medium text-foreground">Pick a time</span>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Checking availability…
        </p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open times on this day — try another day.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((iso) => (
            <Button
              key={iso}
              type="button"
              variant={selected === iso ? "default" : "outline"}
              size="sm"
              onClick={() => onSelect(selected === iso ? null : iso)}
            >
              {formatSlotTime(iso, timezone)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
