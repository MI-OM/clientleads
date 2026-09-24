"use client";

import { useActionState } from "react";
import { Calendar, CalendarClock, Link2Off, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarProvider, IntegrationStatus } from "@/lib/integrations/types";
import {
  clearImportedAction,
  connectCalendlyAction,
  connectGoogleAction,
  disconnectIntegrationAction,
  importCalendarAction,
  type CalendarActionState,
} from "./actions";

/**
 * M8 — provider connection cards + import controls.
 * Server passes serializable connection/environment data; everything
 * mutable happens through the calendar server actions in ./actions.
 */

export interface ConnectPanelProvider {
  provider: CalendarProvider;
  configured: boolean;
  connected: boolean;
  accountId: string | null;
  accountEmail: string | null;
  accountName: string | null;
  lastSyncedAt: string | null;
  status: IntegrationStatus;
}

interface ConnectPanelProps {
  providers: ConnectPanelProvider[];
  hasImportedEvents: boolean;
}

const PROVIDER_META: Record<CalendarProvider, { title: string; description: string }> = {
  google_calendar: {
    title: "Google Calendar",
    description: "Connect a Google account’s primary calendar (read-only).",
  },
  calendly: {
    title: "Calendly",
    description: "Import your Calendly scheduled events.",
  },
};

function ProviderIcon({ provider, className }: { provider: CalendarProvider; className?: string }) {
  return provider === "google_calendar" ? (
    <Calendar className={className} aria-hidden />
  ) : (
    <CalendarClock className={className} aria-hidden />
  );
}

function formatLastSynced(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

const initialState: CalendarActionState = {};

function ProviderCard({ data }: { data: ConnectPanelProvider }) {
  const { provider, configured, connected } = data;
  const meta = PROVIDER_META[provider];
  const [state, formAction, pending] = useActionState<CalendarActionState, FormData>(
    importCalendarAction,
    initialState,
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState<
    CalendarActionState,
    FormData
  >(disconnectIntegrationAction, initialState);

  const statusVariant: "success" | "danger" | "secondary" =
    data.status === "connected" ? "success" : data.status === "error" ? "danger" : "secondary";
  const statusLabel =
    data.status === "connected" ? "Connected" : data.status === "error" ? "Error" : "Not connected";

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ProviderIcon provider={provider} className="mt-0.5 size-5 text-primary" />
            <div>
              <CardTitle className="text-base">{meta.title}</CardTitle>
              <CardDescription>{meta.description}</CardDescription>
            </div>
          </div>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {connected ? (
          <>
            <div className="grid gap-1 rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="truncate font-medium">
                {data.accountName ?? data.accountEmail ?? "Connected account"}
              </p>
              {data.accountEmail ? (
                <p className="truncate text-muted-foreground">{data.accountEmail}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Last synced: {formatLastSynced(data.lastSyncedAt)}
              </p>
            </div>

            {state.error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {state.error}
              </p>
            ) : null}
            {state.ok && state.summary ? (
              <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
                Imported {state.summary.inserted} event
                {state.summary.inserted === 1 ? "" : "s"} · cleared {state.summary.removed} stale
              </p>
            ) : null}
            {disconnectState.error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {disconnectState.error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <form action={formAction}>
                <input type="hidden" name="provider" value={provider} />
                <Button type="submit" variant="outline" size="sm" loading={pending}>
                  <RefreshCw className="size-4" aria-hidden /> Re-import now
                </Button>
              </form>
              <form action={disconnectAction}>
                <input type="hidden" name="provider" value={provider} />
                <input type="hidden" name="accountId" value={data.accountId ?? ""} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  loading={disconnectPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Link2Off className="size-4" aria-hidden /> Disconnect
                </Button>
              </form>
            </div>
          </>
        ) : configured ? (
          <div>
            <form
              action={provider === "google_calendar" ? connectGoogleAction : connectCalendlyAction}
            >
              <Button type="submit" size="sm">
                Connect {provider === "google_calendar" ? "Google Calendar" : "Calendly"}
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" size="sm" disabled>
              Connect {provider === "google_calendar" ? "Google Calendar" : "Calendly"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Not available yet — your workspace administrator can enable it.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Connect panel: two provider cards + a "clear imported events" control. */
export function ConnectPanel({ providers, hasImportedEvents }: ConnectPanelProps) {
  const [clearState, clearAction, clearPending] = useActionState<CalendarActionState, FormData>(
    clearImportedAction,
    initialState,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-6 lg:grid-cols-2">
        {providers.map((data) => (
          <ProviderCard key={data.provider} data={data} />
        ))}
      </div>

      {hasImportedEvents ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trash2 className="size-4 text-muted-foreground" aria-hidden />
              Imported events block availability in the booking engine until cleared.
            </p>
            {clearState.error ? (
              <p role="alert" className="text-sm text-destructive">
                {clearState.error}
              </p>
            ) : null}
          </div>
          <form action={clearAction}>
            <Button type="submit" variant="outline" size="sm" loading={clearPending}>
              <Trash2 className="size-4" aria-hidden /> Clear imported events
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
