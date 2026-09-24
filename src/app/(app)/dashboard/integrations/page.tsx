import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, CalendarDays, Scissors } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyOrg } from "@/lib/auth/org";
import { getIntegration } from "@/lib/integrations/storage";
import { hubspotEnvConfigured } from "@/lib/integrations/hubspot";
import { HubSpotPanel } from "./hubspot-panels";

const ERROR_MESSAGES: Record<string, string> = {
  integration_state:
    "The connection request expired or didn't match — please try the Connect button again.",
  hubspot_denied: "The HubSpot connection was cancelled.",
  integration_auth: "You need to be signed in to connect HubSpot.",
  integration_config: "HubSpot isn't set up for this workspace yet.",
  hubspot_token: "HubSpot couldn't complete the connection. Please try again.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string | string[]; error?: string | string[] }>;
}) {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const connected = params.connected === "hubspot";
  const errorKey = typeof params.error === "string" ? params.error : undefined;

  const hubspot = await getIntegration(ctx.org.id, "hubspot").catch(() => null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Integrations"
        description="Import contacts from HubSpot and keep your calendar in sync."
      />

      {connected ? (
        <div
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          HubSpot connected — you can now import contacts.
        </div>
      ) : null}

      {errorKey ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {ERROR_MESSAGES[errorKey] ??
            "Something went wrong connecting the integration — please try again."}
        </div>
      ) : null}

      <HubSpotPanel integration={hubspot} configured={hubspotEnvConfigured()} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" aria-hidden /> Calendar sync
          </CardTitle>
          <CardDescription>
            Show outside appointments as busy time in your booking engine so you never double-book.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <Link
            href="/dashboard/calendar"
            className="group rounded-lg border p-4 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" aria-hidden />
              <p className="font-medium">Google Calendar</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your Google Calendar and its events show up as blocked slots on your
              availability.
            </p>
            <p className="mt-2 text-xs font-medium text-primary">
              Managed on the Calendar page <span aria-hidden>→</span>
            </p>
          </Link>
          <Link
            href="/dashboard/calendar"
            className="group rounded-lg border p-4 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <Scissors className="size-4 text-primary" aria-hidden />
              <p className="font-medium">Calendly</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your Calendly account and scheduled meetings import as busy time on your
              availability.
            </p>
            <p className="mt-2 text-xs font-medium text-primary">
              Managed on the Calendar page <span aria-hidden>→</span>
            </p>
          </Link>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        HubSpot connects with read-only access to your contacts. Calendar sync is managed from the
        Calendar page.
      </p>
    </div>
  );
}
