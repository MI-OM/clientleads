"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getMyOrg } from "@/lib/auth/org";
import type { OrgContext } from "@/lib/auth/org";
import { getIntegration, removeIntegration } from "@/lib/integrations/storage";
import { hubspotAuthorizeUrl, hubspotEnvConfigured } from "@/lib/integrations/hubspot";
import { runHubspotCrmImport } from "@/lib/integrations/crm";
import type { CrmImportSummary } from "@/lib/integrations/crm";
import type { IntegrationProvider } from "@/lib/integrations/types";

export interface IntegrationActionState {
  error?: string;
  ok?: boolean;
  summary?: CrmImportSummary;
}

function isAdmin(ctx: OrgContext | null): boolean {
  return Boolean(ctx && (ctx.role === "owner" || ctx.role === "admin"));
}

/**
 * Start HubSpot OAuth: store a one-time CSRF `state` cookie (httpOnly,
 * 10 min, lax) then bounce the browser to HubSpot's authorize URL. The
 * callback at /api/integrations/hubspot/callback verifies + clears it.
 * `redirect()` throws NEXT_REDIRECT — deliberately not wrapped in try/catch.
 */
export async function connectHubSpotAction(): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx || !isAdmin(ctx)) return;
  if (!hubspotEnvConfigured()) return;

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("cl_integration_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  redirect(hubspotAuthorizeUrl(state));
}

/** Fetch HubSpot contacts and import them into this org's CRM. */
export async function importHubSpotAction(): Promise<IntegrationActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (!isAdmin(ctx)) return { error: "Only owners and admins can import contacts." };

  const connection = await getIntegration(ctx.org.id, "hubspot").catch(() => null);
  if (!connection) return { error: "HubSpot isn't connected — connect it first." };

  try {
    const summary = await runHubspotCrmImport(ctx.org.id, connection);
    revalidatePath("/dashboard/integrations");
    revalidatePath("/dashboard/contacts");
    return { ok: true, summary };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "HubSpot import failed — please try again.",
    };
  }
}

/** Remove a stored integration connection (owner/admin only). */
export async function disconnectIntegrationAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };
  if (!isAdmin(ctx)) return { error: "Only owners and admins can disconnect integrations." };

  const provider = String(formData.get("provider") ?? "") as IntegrationProvider;
  const providerAccountId = String(formData.get("providerAccountId") ?? "").trim();
  if (!provider || !providerAccountId) return { error: "Missing connection details." };

  try {
    await removeIntegration(ctx.org.id, provider, providerAccountId);
  } catch {
    return { error: "Couldn't disconnect the integration. Please try again." };
  }

  revalidatePath("/dashboard/integrations");
  return { ok: true };
}
