import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getMyOrg } from "@/lib/auth/org";
import { connectGoogleCalendar, googleCalendarRedirectUri } from "@/lib/integrations/calendar";

export const dynamic = "force-dynamic";

/**
 * Google Calendar OAuth callback (M8).
 *
 * Verifies the CSRF cookie `cl_integration_state` that connectGoogleAction
 * set before redirecting to Google, exchanges the `code` for tokens, reads
 * the account identity and persists the connection, then bounces back to
 * /dashboard/calendar with a success or error banner. The state cookie is
 * cleared on every path.
 */
const STATE_COOKIE = "cl_integration_state";

export async function GET(request: NextRequest) {
  const ctx = await getMyOrg();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const stateParam = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const providerError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expected = cookieStore.get(STATE_COOKIE)?.value ?? "";
  cookieStore.delete(STATE_COOKIE);

  const toError = (key = "google_connect_failed") =>
    NextResponse.redirect(
      new URL(`/dashboard/calendar?error=${encodeURIComponent(key)}`, request.url),
    );
  const toSuccess = () =>
    NextResponse.redirect(new URL("/dashboard/calendar?connected=google_calendar", request.url));

  if (providerError || !code || !expected || !stateParam || stateParam !== expected) {
    return toError("integration_state");
  }

  try {
    await connectGoogleCalendar(ctx.org.id, code, googleCalendarRedirectUri());
  } catch {
    return toError();
  }

  return toSuccess();
}
