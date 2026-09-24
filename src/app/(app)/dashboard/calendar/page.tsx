import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { getMyOrg } from "@/lib/auth/org";
import { listIntegrations, listImportedEvents } from "@/lib/integrations/storage";
import { calendarProviderConfigured } from "@/lib/integrations/calendar";
import type { CalendarProvider, IntegrationStatus } from "@/lib/integrations/types";
import { listAppointments, listBlockedTimes } from "@/lib/booking/queries";
import { ConnectPanel } from "./connect-panel";
import { CalendarGrid } from "./calendar-grid";

/**
 * M8 — /dashboard/calendar — merged month calendar: appointments, imported
 * external events (Google Calendar / Calendly) and blocked times. Imported
 * events with blocks_availability hold slots in the booking engine at the
 * DB level (migration 00016); this page is the connection/import control
 * center plus the visual merge.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const VIEW_PAD_MS = 7 * 864e5;

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "This integration isn’t configured — check your workspace setup and try again.",
  integration_state:
    "Your Google connection attempt was cancelled or failed its security check — please try again.",
  google_connect_failed: "Google didn’t complete the connection — please try again.",
  calendly_connect_failed:
    "Calendly rejected the connection — check CALENDLY_API_KEY and try again.",
};

const CONNECTED_MESSAGES: Record<string, string> = {
  google_calendar: "Connected to Google Calendar — re-import to pull your events into the grid.",
  calendly: "Connected to Calendly — re-import to pull your events into the grid.",
};

const PROVIDER_LABELS: Record<CalendarProvider, string> = {
  google_calendar: "Google Calendar",
  calendly: "Calendly",
};

function currentMonthKey(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
}

function firstScalar(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string | string[];
    connected?: string | string[];
    error?: string | string[];
  }>;
}) {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const timezone = ctx.org.timezone;
  const month = MONTH_RE.test(firstScalar(params.month))
    ? firstScalar(params.month)
    : currentMonthKey(timezone);
  const [year, m] = month.split("-").map(Number);

  // Query window: the displayed month (in UTC) padded by a week on each
  // side so adjacent-month cells in the 6×7 grid have data.
  const from = new Date(Date.UTC(year, m - 1, 1) - VIEW_PAD_MS).toISOString();
  const to = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999) + VIEW_PAD_MS).toISOString();

  const [integrations, importedEvents, appointments, blocked] = await Promise.all([
    listIntegrations(ctx.org.id).catch(() => []),
    listImportedEvents(ctx.org.id, { from, to }).catch(() => []),
    listAppointments(ctx.org.id).catch(() => []),
    listBlockedTimes(ctx.org.id).catch(() => []),
  ]);

  const providers: Array<{
    provider: CalendarProvider;
    configured: boolean;
    connected: boolean;
    accountId: string | null;
    accountEmail: string | null;
    accountName: string | null;
    lastSyncedAt: string | null;
    status: IntegrationStatus;
  }> = (["google_calendar", "calendly"] as CalendarProvider[]).map((provider) => {
    const integration = integrations.find((i) => i.provider === provider) ?? null;
    return {
      provider,
      configured: calendarProviderConfigured(provider),
      connected: integration !== null,
      accountId: integration?.providerAccountId ?? null,
      accountEmail: integration?.providerAccountEmail ?? null,
      accountName: integration?.providerAccountName ?? null,
      lastSyncedAt: integration?.lastSyncedAt ?? null,
      status: integration?.status ?? "disconnected",
    };
  });

  const appointmentsView = appointments
    .filter((a) => a.startsAt < to && a.endsAt > from)
    .map((a) => ({
      id: a.id,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      serviceName: a.serviceName ?? null,
      customerName: a.customerName,
      status: a.status,
    }));

  const eventsView = importedEvents.map((e) => ({
    id: e.id,
    provider: e.provider,
    title: e.title,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
  }));

  const blockedView = blocked
    .filter((b) => b.startsAt < to && b.endsAt > from)
    .map((b) => ({ id: b.id, startsAt: b.startsAt, endsAt: b.endsAt, reason: b.reason }));

  const connectedKey = firstScalar(params.connected);
  const errorKey = firstScalar(params.error);
  const connectedMessage = CONNECTED_MESSAGES[connectedKey] ?? "";
  const errorMessage = ERROR_MESSAGES[errorKey] ?? (errorKey ? "Something went wrong." : "");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Appointments, imported events and blocked times, all in one month view."
      />

      {connectedMessage ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {connectedMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {errorMessage}
        </div>
      ) : null}

      <ConnectPanel providers={providers} hasImportedEvents={importedEvents.length > 0} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Overview</CardTitle>
            <p className="text-xs text-muted-foreground">
              {PROVIDER_LABELS.google_calendar} events block availability unless marked transparent;{" "}
              {PROVIDER_LABELS.calendly} events always block it.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <CalendarGrid
            appointments={appointmentsView}
            events={eventsView}
            blocked={blockedView}
            timezone={timezone}
            month={month}
            baseHref="/dashboard/calendar"
          />
        </CardContent>
      </Card>
    </div>
  );
}
