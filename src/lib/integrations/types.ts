/**
 * M8 — integration domain types (connections + imported calendar events).
 *
 * Owned by the integrations module; consumers are the CRM import
 * (HubSpot) and the calendar sync (Google Calendar / Calendly) features.
 */

export type IntegrationProvider = "hubspot" | "google_calendar" | "calendly";

export type CalendarProvider = Extract<IntegrationProvider, "google_calendar" | "calendly">;

export type IntegrationStatus = "connected" | "error" | "disconnected";

/** A row from `public.integrations` (see migration 00016). */
export interface Integration {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  providerAccountId: string;
  providerAccountEmail: string | null;
  providerAccountName: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: string | null;
  scopes: string[];
  config: Record<string, unknown>;
  status: IntegrationStatus;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A row from `public.imported_calendar_events`. */
export interface ImportedCalendarEvent {
  id: string;
  organizationId: string;
  provider: CalendarProvider;
  providerEventId: string;
  calendarId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string | null;
  attendees: string[];
  blocksAvailability: boolean;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Payload for a new/upserted connection (points at saveIntegration). */
export interface SaveIntegrationInput {
  provider: IntegrationProvider;
  providerAccountId: string;
  providerAccountEmail?: string | null;
  providerAccountName?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string;
  expiresAt?: string | null;
  scopes?: string[];
  config?: Record<string, unknown>;
  status?: IntegrationStatus;
}

/** Normalized external event fed to the import runner. */
export interface ExternalEventInput {
  provider: CalendarProvider;
  providerEventId: string;
  calendarId?: string | null;
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  timezone?: string;
  location?: string | null;
  attendees?: string[];
  blocksAvailability?: boolean;
  raw?: Record<string, unknown>;
}
