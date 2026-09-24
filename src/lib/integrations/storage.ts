/**
 * M8 — integration persistence helpers (server-only).
 *
 * Thin data access over `public.integrations` and
 * `public.imported_calendar_events` (migration 00016). Both providers —
 * HubSpot CRM import and Google/Calendly calendar sync — read and write
 * connections/imported events exclusively through these helpers, so the
 * tables never get two writers with different row-mapping conventions.
 *
 * RLS: reads for org members, writes for owner/admin. Server actions
 * must still gate on role (getMyOrg) before calling writers.
 */
import { createClient } from "@/lib/supabase/server";
import type {
  ExternalEventInput,
  ImportedCalendarEvent,
  Integration,
  IntegrationProvider,
  IntegrationStatus,
  SaveIntegrationInput,
} from "./types";

/* ── row mapping ─────────────────────────────────────────────────────── */

interface IntegrationRow {
  id: string;
  organization_id: string;
  provider: IntegrationProvider;
  provider_account_id: string;
  provider_account_email: string | null;
  provider_account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_at: string | null;
  scopes: string[];
  config: Record<string, unknown>;
  status: IntegrationStatus;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapIntegration(row: IntegrationRow): Integration {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    providerAccountEmail: row.provider_account_email,
    providerAccountName: row.provider_account_name,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenType: row.token_type,
    expiresAt: row.expires_at,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    config: (row.config ?? {}) as Record<string, unknown>,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface CalendarEventRow {
  id: string;
  organization_id: string;
  provider: ImportedCalendarEvent["provider"];
  provider_event_id: string;
  calendar_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string | null;
  attendees: string[];
  blocks_availability: boolean;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function mapEvent(row: CalendarEventRow): ImportedCalendarEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    calendarId: row.calendar_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    location: row.location,
    attendees: Array.isArray(row.attendees) ? row.attendees : [],
    blocksAvailability: row.blocks_availability,
    raw: (row.raw ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ── integrations ────────────────────────────────────────────────────── */

export async function listIntegrations(orgId: string): Promise<Integration[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("organization_id", orgId)
    .order("provider", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapIntegration(row as unknown as IntegrationRow));
}

export async function getIntegration(
  orgId: string,
  provider: IntegrationProvider,
): Promise<Integration | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("organization_id", orgId)
    .eq("provider", provider)
    .limit(1);
  if (error) throw error;
  const row = data?.[0] as IntegrationRow | undefined;
  return row ? mapIntegration(row) : null;
}

/** Upsert on (organization_id, provider, provider_account_id). */
export async function saveIntegration(
  orgId: string,
  input: SaveIntegrationInput,
): Promise<Integration> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integrations")
    .upsert(
      {
        organization_id: orgId,
        provider: input.provider,
        provider_account_id: input.providerAccountId,
        provider_account_email: input.providerAccountEmail ?? null,
        provider_account_name: input.providerAccountName ?? null,
        access_token: input.accessToken,
        refresh_token: input.refreshToken ?? null,
        token_type: input.tokenType ?? "Bearer",
        expires_at: input.expiresAt ?? null,
        scopes: input.scopes ?? [],
        config: input.config ?? {},
        status: input.status ?? "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider,provider_account_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return mapIntegration(data as unknown as IntegrationRow);
}

export async function removeIntegration(
  orgId: string,
  provider: IntegrationProvider,
  providerAccountId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("organization_id", orgId)
    .eq("provider", provider)
    .eq("provider_account_id", providerAccountId);
  if (error) throw error;
}

export async function setIntegrationStatus(
  orgId: string,
  provider: IntegrationProvider,
  providerAccountId: string,
  status: IntegrationStatus,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("provider", provider)
    .eq("provider_account_id", providerAccountId);
  if (error) throw error;
}

export async function touchIntegrationSync(
  orgId: string,
  provider: IntegrationProvider,
  providerAccountId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .update({
      status: "connected",
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId)
    .eq("provider", provider)
    .eq("provider_account_id", providerAccountId);
  if (error) throw error;
}

/* ── imported calendar events ────────────────────────────────────────── */

export async function listImportedEvents(
  orgId: string,
  opts: { from?: string; to?: string } = {},
): Promise<ImportedCalendarEvent[]> {
  const supabase = await createClient();
  let query = supabase
    .from("imported_calendar_events")
    .select("*")
    .eq("organization_id", orgId)
    .order("starts_at", { ascending: true });
  if (opts.from) query = query.gte("starts_at", opts.from);
  if (opts.to) query = query.lt("starts_at", opts.to);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapEvent(row as unknown as CalendarEventRow));
}

/**
 * Idempotent re-import: deletes the provider's events overlapping
 * [from, to) and inserts the fetched set, so the table always mirrors
 * the provider. Returns what landed. Pass blocksAvailability to override
 * every event's booking-hold flag.
 */
export async function replaceImportedEvents(
  orgId: string,
  events: ExternalEventInput[],
  opts: { from?: string; to?: string; blocksAvailability?: boolean } = {},
): Promise<{ inserted: number; removed: number }> {
  const supabase = await createClient();
  const providers = [...new Set(events.map((e) => e.provider))];

  let removed = 0;
  for (const provider of providers) {
    let del = supabase
      .from("imported_calendar_events")
      .delete()
      .eq("organization_id", orgId)
      .eq("provider", provider);
    if (opts.from) del = del.gte("ends_at", opts.from);
    if (opts.to) del = del.lt("starts_at", opts.to);
    const { error, data } = await del.select("id");
    if (error) throw error;
    removed += (data ?? []).length;
  }

  const rows = events.map((e) => ({
    organization_id: orgId,
    provider: e.provider,
    provider_event_id: e.providerEventId,
    calendar_id: e.calendarId ?? null,
    title: e.title || "Busy",
    starts_at: e.startsAt,
    ends_at: e.endsAt,
    timezone: e.timezone ?? "UTC",
    location: e.location ?? null,
    attendees: e.attendees ?? [],
    blocks_availability: opts.blocksAvailability ?? e.blocksAvailability ?? true,
    raw: e.raw ?? {},
  }));

  if (rows.length === 0) return { inserted: 0, removed };
  const { error } = await supabase.from("imported_calendar_events").insert(rows);
  if (error) throw error;
  return { inserted: rows.length, removed };
}

export async function clearImportedEvents(orgId: string, provider: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("imported_calendar_events")
    .delete()
    .eq("organization_id", orgId)
    .eq("provider", provider);
  if (error) throw error;
}
