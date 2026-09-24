"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getMyOrg } from "@/lib/auth/org";
import { clearImportedEvents, removeIntegration } from "@/lib/integrations/storage";
import {
  buildGoogleAuthorizeUrl,
  calendarProviderConfigured,
  connectCalendly,
  importCalendarEvents,
} from "@/lib/integrations/calendar";
import type { CalendarProvider } from "@/lib/integrations/types";

/**
 * M8 — calendar connection + import server actions.
 *
 * connectGoogleAction / connectCalendlyAction are plain form actions that
 * redirect (Google → OAuth consent; Calendly → verify + save, back to the
 * page). The rest return a CalendarActionState and revalidate the page, so
 * the connect panel can reflect results (e.g. import counts).
 */

export interface CalendarActionState {
  error?: string;
  ok?: boolean;
  summary?: { provider: CalendarProvider; inserted: number; removed: number };
}

const GOOGLE_STATE_COOKIE = "cl_integration_state";

function isAdmin(ctx: Awaited<ReturnType<typeof getMyOrg>>): boolean {
  return !!ctx && (ctx.role === "owner" || ctx.role === "admin");
}

function parseProvider(raw: FormDataEntryValue | null): CalendarProvider | null {
  const value = String(raw ?? "");
  return value === "google_calendar" || value === "calendly" ? value : null;
}

/** Map machine error keys to a human description for the banner. */
function importErrorMessage(raw: string): string {
  if (raw.startsWith("calendar_not_connected")) {
    return "This calendar isn't connected yet — connect it first.";
  }
  if (raw.startsWith("google_refresh_token_missing")) {
    return "Google needs reconnecting — the saved token can’t be refreshed.";
  }
  if (raw.startsWith("google_token_exchange_failed")) {
    return "Google refused the token exchange — reconnect the account.";
  }
  if (raw.startsWith("google_identity_failed")) {
    return "Couldn’t read the Google account — try again.";
  }
  if (raw.startsWith("google_events_failed")) {
    return "Google returned an error while fetching events.";
  }
  if (raw.startsWith("calendly_not_configured")) {
    return "Calendly isn’t configured — add CALENDLY_API_KEY to .env.local.";
  }
  if (raw.startsWith("calendly_unconfigured_connection")) {
    return "This Calendly connection is incomplete — disconnect and reconnect it.";
  }
  if (raw.startsWith("calendly_me_failed")) {
    return "Calendly rejected the API key — check CALENDLY_API_KEY.";
  }
  if (raw.startsWith("calendly_events_failed")) {
    return "Calendly returned an error while fetching events.";
  }
  return "Import failed — check the connection and try again.";
}

/** Start Google Calendar OAuth: set the CSRF cookie, then bounce to Google. */
export async function connectGoogleAction(): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/dashboard");
  if (!calendarProviderConfigured("google_calendar")) {
    redirect("/dashboard/calendar?error=not_configured");
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  redirect(buildGoogleAuthorizeUrl(state));
}

/** Verify the app-level Calendly key and save the connection. */
export async function connectCalendlyAction(): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/dashboard");
  if (!calendarProviderConfigured("calendly")) {
    redirect("/dashboard/calendar?error=not_configured");
  }

  try {
    await connectCalendly(ctx.org.id);
  } catch {
    redirect("/dashboard/calendar?error=calendly_connect_failed");
  }
  redirect("/dashboard/calendar?connected=calendly");
}

/** Re-import one provider's events (30d back, 180d ahead). */
export async function importCalendarAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (!isAdmin(ctx)) {
    return { error: "Only owners and admins can manage calendar integrations." };
  }

  const provider = parseProvider(formData.get("provider"));
  if (!provider) return { error: "Unknown calendar provider." };

  try {
    const result = await importCalendarEvents(ctx.org.id, provider);
    revalidatePath("/dashboard/calendar");
    return { ok: true, summary: result };
  } catch (err) {
    const raw = err instanceof Error && err.message ? err.message : "unknown_error";
    return { error: importErrorMessage(raw) };
  }
}

/** Disconnect a provider and drop its imported events. */
export async function disconnectIntegrationAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (!isAdmin(ctx)) {
    return { error: "Only owners and admins can manage calendar integrations." };
  }

  const provider = parseProvider(formData.get("provider"));
  const accountId = String(formData.get("accountId") ?? "");
  if (!provider) return { error: "Unknown calendar provider." };
  if (!accountId) return { error: "Missing connection id." };

  try {
    await removeIntegration(ctx.org.id, provider, accountId);
    // Imported events belong to the connection — remove them with it.
    await clearImportedEvents(ctx.org.id, provider);
  } catch {
    return { error: "Couldn’t disconnect — try again." };
  }
  revalidatePath("/dashboard/calendar");
  return { ok: true };
}

/**
 * Clear imported calendar events. With no `provider` field this clears
 * both calendar providers (used by the "Clear imported events" control).
 */
export async function clearImportedAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (!isAdmin(ctx)) {
    return { error: "Only owners and admins can manage calendar integrations." };
  }

  const provider = parseProvider(formData.get("provider"));
  const providers: CalendarProvider[] = provider ? [provider] : ["google_calendar", "calendly"];

  try {
    for (const p of providers) {
      await clearImportedEvents(ctx.org.id, p);
    }
  } catch {
    return { error: "Couldn’t clear imported events — try again." };
  }
  revalidatePath("/dashboard/calendar");
  return { ok: true };
}
