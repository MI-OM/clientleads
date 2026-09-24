/**
 * M8 — Google Calendar + Calendly clients and the calendar import runner
 * (server-only; never import from a client component).
 *
 * Connects the two calendar providers to `public.integrations` and pulls
 * their events into `public.imported_calendar_events` exclusively through
 * the shared storage helpers. Imported events with `blocks_availability`
 * (the default) hold slots in the booking engine at the DB level, so the
 * business never double-books against its real calendar.
 *
 * Env (all optional — a provider whose keys are missing renders disabled):
 *   GOOGLE_CAL_CLIENT_ID / GOOGLE_CAL_CLIENT_SECRET  (Google OAuth)
 *   CALENDLY_API_KEY                                  (Calendly PAT)
 *   NEXT_PUBLIC_APP_URL                               (OAuth redirect base)
 */
import type { CalendarProvider, ExternalEventInput, Integration } from "./types";
import {
  getIntegration,
  replaceImportedEvents,
  saveIntegration,
  setIntegrationStatus,
  touchIntegrationSync,
} from "./storage";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const CALENDLY_BASE = "https://api.calendly.com";
const CALENDLY_PAGE_SIZE = 100;
const CALENDLY_MAX_PAGES = 5;

/* ── configuration ────────────────────────────────────────────────────── */

/** Whether the provider's env keys are present (server-only check). */
export function calendarProviderConfigured(provider: CalendarProvider): boolean {
  return provider === "google_calendar"
    ? Boolean(process.env.GOOGLE_CAL_CLIENT_ID && process.env.GOOGLE_CAL_CLIENT_SECRET)
    : Boolean(process.env.CALENDLY_API_KEY);
}

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function googleCalendarRedirectUri(): string {
  return `${appBaseUrl()}/api/integrations/google-calendar/callback`;
}

/** The Google OAuth authorize URL for a given CSRF state value. */
export function buildGoogleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CAL_CLIENT_ID ?? "",
    redirect_uri: googleCalendarRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/* ── Google: token exchange / refresh / identity ──────────────────────── */

export interface GoogleTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scopes: string[];
  tokenType: string;
}

async function postGoogleToken(body: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const reason = typeof data.error === "string" ? data.error : String(res.status);
    throw new Error(`google_token_exchange_failed: ${reason}`);
  }
  return data;
}

/** OAuth code → access/refresh tokens (used by the callback route). */
export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResult> {
  const data = await postGoogleToken(
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CAL_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CAL_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) throw new Error("google_token_exchange_failed: empty access_token");
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt: new Date(Date.now() + Number(data.expires_in ?? 3600) * 1000).toISOString(),
    scopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : [],
    tokenType: typeof data.token_type === "string" ? data.token_type : "Bearer",
  };
}

/** Refresh a Google access token and persist it back to the connection. */
async function refreshGoogleToken(orgId: string, integration: Integration): Promise<Integration> {
  if (!integration.refreshToken) {
    throw new Error("google_refresh_token_missing");
  }
  const data = await postGoogleToken(
    new URLSearchParams({
      client_id: process.env.GOOGLE_CAL_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CAL_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: integration.refreshToken,
    }),
  );
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) throw new Error("google_token_exchange_failed: empty access_token");
  return saveIntegration(orgId, {
    provider: "google_calendar",
    providerAccountId: integration.providerAccountId,
    providerAccountEmail: integration.providerAccountEmail,
    providerAccountName: integration.providerAccountName,
    accessToken,
    refreshToken:
      typeof data.refresh_token === "string" ? data.refresh_token : integration.refreshToken,
    tokenType: typeof data.token_type === "string" ? data.token_type : integration.tokenType,
    expiresAt: new Date(Date.now() + Number(data.expires_in ?? 3600) * 1000).toISOString(),
    scopes: [
      ...new Set([
        ...integration.scopes,
        ...(typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : []),
      ]),
    ],
    config: integration.config,
    status: integration.status,
  });
}

export interface GoogleIdentity {
  id: string;
  email: string | null;
  name: string | null;
}

export async function fetchGoogleIdentity(accessToken: string): Promise<GoogleIdentity> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`google_identity_failed: ${res.status}`);
  const id = typeof data.id === "string" ? data.id : "";
  if (!id) throw new Error("google_identity_failed: missing id");
  return {
    id,
    email: typeof data.email === "string" ? data.email : null,
    name: typeof data.name === "string" ? data.name : null,
  };
}

/**
 * Complete a Google OAuth flow: exchange the code, read the account,
 * persist the connection. The redirect_uri must match the one used when
 * building the authorize URL.
 */
export async function connectGoogleCalendar(
  orgId: string,
  code: string,
  redirectUri: string,
): Promise<void> {
  const tokens = await exchangeGoogleCode(code, redirectUri);
  const identity = await fetchGoogleIdentity(tokens.accessToken);
  await saveIntegration(orgId, {
    provider: "google_calendar",
    providerAccountId: identity.id,
    providerAccountEmail: identity.email,
    providerAccountName: identity.name,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: tokens.tokenType,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
  });
}

/* ── Google: event import ─────────────────────────────────────────────── */

/**
 * Map one Google Calendar API item to a normalized external event.
 * All-day events: start/end `date` values are treated as UTC midnights
 * (Google's end dates are exclusive — matches the spec).
 */
function toExternalGoogleEvent(raw: unknown, from: string, to: string): ExternalEventInput | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id : "";
  if (!id) return null;

  const start = typeof item.start === "object" && item.start !== null ? item.start : {};
  const end = typeof item.end === "object" && item.end !== null ? item.end : {};
  const startObj = start as Record<string, unknown>;
  const endObj = end as Record<string, unknown>;

  const startsAt = pickInstant(startObj);
  const endsAt = pickInstant(endObj);
  if (!startsAt || !endsAt || startsAt >= endsAt) return null;
  // Only keep events overlapping the requested window.
  if (!(startsAt < to && endsAt > from)) return null;

  const attendees: string[] = [];
  if (Array.isArray(item.attendees)) {
    for (const a of item.attendees) {
      if (typeof a === "object" && a !== null) {
        const email = (a as Record<string, unknown>).email;
        if (typeof email === "string" && email) attendees.push(email);
      }
    }
  }

  const title =
    typeof item.summary === "string" && item.summary.trim() ? item.summary.trim() : "Busy";

  return {
    provider: "google_calendar",
    providerEventId: id,
    calendarId: "primary",
    title,
    startsAt,
    endsAt,
    timezone: typeof startObj.timeZone === "string" ? startObj.timeZone : "UTC",
    location: typeof item.location === "string" ? item.location : null,
    attendees,
    blocksAvailability: item.transparency !== "transparent",
    raw: { ...item },
  };
}

/** An ISO instant from a Google `dateTime` or all-day `date` field. */
function pickInstant(source: Record<string, unknown>): string | null {
  const dateTime = typeof source.dateTime === "string" ? source.dateTime : "";
  if (dateTime) {
    const d = new Date(dateTime);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const date = typeof source.date === "string" ? source.date : "";
  if (date) {
    const d = new Date(`${date}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * Fetch Google Calendar events in [from, to). On a 401 the access token
 * is refreshed (persisted back via saveIntegration) and retried once.
 */
export async function fetchGoogleEvents(
  orgId: string,
  integration: Integration,
  from: string,
  to: string,
): Promise<ExternalEventInput[]> {
  const url = new URL(GOOGLE_EVENTS_URL);
  url.searchParams.set("timeMin", from);
  url.searchParams.set("timeMax", to);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");

  let current = integration;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${current.accessToken}` },
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) {
      current = await refreshGoogleToken(orgId, integration);
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as { items?: unknown };
    if (!res.ok) throw new Error(`google_events_failed: ${res.status}`);
    const items = Array.isArray(data.items) ? data.items : [];
    const events = items
      .map((item) => toExternalGoogleEvent(item, from, to))
      .filter((e): e is ExternalEventInput => e !== null);
    return events;
  }
  throw new Error("google_events_failed: too many retries");
}

/* ── Calendly ─────────────────────────────────────────────────────────── */

export interface CalendlyMe {
  uri: string;
  email: string | null;
  name: string | null;
  organizationUri: string;
}

/** GET /v2/users/me with the app-level PAT (connect flow). */
export async function fetchCalendlyMe(): Promise<CalendlyMe> {
  const apiKey = process.env.CALENDLY_API_KEY;
  if (!apiKey) throw new Error("calendly_not_configured");
  const res = await fetch(`${CALENDLY_BASE}/v2/users/me`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { resource?: unknown };
  if (!res.ok) throw new Error(`calendly_me_failed: ${res.status}`);
  const resource = typeof data.resource === "object" && data.resource !== null ? data.resource : {};
  const me = resource as Record<string, unknown>;
  const uri = typeof me.uri === "string" ? me.uri : "";
  if (!uri) throw new Error("calendly_me_failed: missing user uri");

  const orgRaw = me.organization;
  const organizationUri =
    typeof orgRaw === "string"
      ? orgRaw
      : typeof orgRaw === "object" && orgRaw !== null
        ? (((orgRaw as Record<string, unknown>).uri as string) ?? "")
        : "";

  return {
    uri,
    email: typeof me.email === "string" ? me.email : null,
    name: typeof me.name === "string" ? me.name : null,
    organizationUri: typeof organizationUri === "string" ? organizationUri : "",
  };
}

/** Verify the app-level Calendly key and persist the connection. */
export async function connectCalendly(orgId: string): Promise<void> {
  const me = await fetchCalendlyMe();
  await saveIntegration(orgId, {
    provider: "calendly",
    providerAccountId: me.uri,
    providerAccountEmail: me.email,
    providerAccountName: me.name,
    accessToken: process.env.CALENDLY_API_KEY ?? "",
    config: { organization_uri: me.organizationUri },
  });
}

/** Map one Calendly scheduled event to a normalized external event. */
function toExternalCalendlyEvent(raw: unknown): ExternalEventInput | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  const uri = typeof item.uri === "string" ? item.uri : "";
  const providerEventId = uri.split("/").filter(Boolean).pop() ?? "";
  if (!providerEventId) return null;

  const startsAt = typeof item.start_time === "string" ? item.start_time : "";
  const endsAt = typeof item.end_time === "string" ? item.end_time : "";
  if (!startsAt || !endsAt) return null;

  const title =
    typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Appointment";

  let location: string | null = null;
  if (typeof item.location === "object" && item.location !== null) {
    const loc = item.location as Record<string, unknown>;
    const type = typeof loc.type === "string" ? loc.type : "";
    const value = typeof loc.location === "string" ? loc.location : "";
    location = value ? `${type} ${value}`.trim() : type || null;
  }

  return {
    provider: "calendly",
    providerEventId,
    title,
    startsAt,
    endsAt,
    timezone: typeof item.timezone === "string" ? item.timezone : "UTC",
    location,
    attendees: [],
    blocksAvailability: true,
    raw: { ...item },
  };
}

/**
 * Fetch scheduled events for the Calendly org, paginating with
 * `pagination.next_page_token` (up to CALENDLY_MAX_PAGES pages).
 */
export async function fetchCalendlyEvents(
  integration: Integration,
  from: string,
  to: string,
): Promise<ExternalEventInput[]> {
  const organizationUri =
    typeof integration.config.organization_uri === "string"
      ? integration.config.organization_uri
      : "";
  if (!organizationUri) throw new Error("calendly_unconfigured_connection");

  const base = new URL(`${CALENDLY_BASE}/v2/scheduled_events`);
  base.searchParams.set("organization", organizationUri);
  base.searchParams.set("min_start_time", from);
  base.searchParams.set("max_start_time", to);
  base.searchParams.set("count", String(CALENDLY_PAGE_SIZE));

  const events: ExternalEventInput[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < CALENDLY_MAX_PAGES; page += 1) {
    if (pageToken) {
      base.searchParams.set("page_token", pageToken);
    } else {
      base.searchParams.delete("page_token");
    }
    const res = await fetch(base, {
      headers: { Authorization: `Bearer ${integration.accessToken}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`calendly_events_failed: ${res.status}`);

    const collection = Array.isArray(data.collection) ? data.collection : [];
    if (collection.length === 0) break;
    for (const item of collection) {
      const event = toExternalCalendlyEvent(item);
      if (event) events.push(event);
    }

    const pagination =
      typeof data.pagination === "object" && data.pagination !== null
        ? (data.pagination as Record<string, unknown>)
        : {};
    const nextToken =
      typeof pagination.next_page_token === "string" ? pagination.next_page_token : null;
    if (!nextToken) break;
    pageToken = nextToken;
  }

  return events;
}

/* ── import runner (shared by both providers) ─────────────────────────── */

export interface CalendarImportResult {
  provider: CalendarProvider;
  inserted: number;
  removed: number;
}

const IMPORT_FROM_MS = 30 * 864e5; // past 30 days
const IMPORT_TO_MS = 180 * 864e5; // next 180 days

/**
 * Re-import one provider's events for [now-30d, now+180d). Idempotent:
 * replaceImportedEvents deletes the provider's rows overlapping the window
 * and inserts the fresh set, then last_synced_at is touched. On failure the
 * connection is marked `error` and the error re-thrown for the caller.
 */
export async function importCalendarEvents(
  orgId: string,
  provider: CalendarProvider,
): Promise<CalendarImportResult> {
  const integration = await getIntegration(orgId, provider);
  if (!integration) throw new Error("calendar_not_connected");

  const now = Date.now();
  const from = new Date(now - IMPORT_FROM_MS).toISOString();
  const to = new Date(now + IMPORT_TO_MS).toISOString();

  try {
    const events =
      provider === "google_calendar"
        ? await fetchGoogleEvents(orgId, integration, from, to)
        : await fetchCalendlyEvents(integration, from, to);

    const result = await replaceImportedEvents(orgId, events, { from, to });
    await touchIntegrationSync(orgId, provider, integration.providerAccountId);
    return { provider, inserted: result.inserted, removed: result.removed };
  } catch (err) {
    await setIntegrationStatus(orgId, provider, integration.providerAccountId, "error").catch(
      () => undefined,
    );
    throw err;
  }
}
