import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getMyOrg } from "@/lib/auth/org";
import {
  appBaseUrl,
  exchangeHubspotCode,
  getHubspotAccountInfo,
  hubspotEnvConfigured,
} from "@/lib/integrations/hubspot";
import { saveIntegration } from "@/lib/integrations/storage";

export const dynamic = "force-dynamic";

/** Redirect back to /dashboard/integrations with banner query params. */
function dashboardRedirect(params: Record<string, string>): NextResponse {
  const url = new URL(`${appBaseUrl()}/dashboard/integrations`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url.toString());
}

/**
 * HubSpot OAuth callback (GET). Verifies the CSRF `state` cookie that
 * connectHubSpotAction set, exchanges the `code` for tokens, resolves the
 * connected account identity and saves the connection for the signed-in
 * org. All failures redirect back with a friendly `?error=` banner.
 */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const code = search.get("code");
  const state = search.get("state");
  const denied = search.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("cl_integration_state")?.value;
  cookieStore.delete("cl_integration_state");

  if (denied) {
    return dashboardRedirect({ error: "hubspot_denied" });
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return dashboardRedirect({ error: "integration_state" });
  }
  if (!hubspotEnvConfigured()) {
    return dashboardRedirect({ error: "integration_config" });
  }

  try {
    const tokens = await exchangeHubspotCode(code);
    const account = await getHubspotAccountInfo(tokens.access_token);
    if (!account.hubId) {
      throw new Error("HubSpot did not return a portal id.");
    }

    const ctx = await getMyOrg();
    if (!ctx) {
      return dashboardRedirect({ error: "integration_auth" });
    }

    await saveIntegration(ctx.org.id, {
      provider: "hubspot",
      providerAccountId: account.hubId,
      providerAccountEmail: account.user?.email ?? null,
      providerAccountName: account.user?.firstName ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenType: tokens.token_type || "Bearer",
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      scopes: tokens.scope ? tokens.scope.split(" ") : [],
      status: "connected",
    });

    return dashboardRedirect({ connected: "hubspot" });
  } catch {
    return dashboardRedirect({ error: "hubspot_token" });
  }
}
