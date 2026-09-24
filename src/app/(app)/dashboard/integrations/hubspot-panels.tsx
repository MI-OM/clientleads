"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Download, Link2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/crm/format";
import type { Integration } from "@/lib/integrations/types";
import {
  connectHubSpotAction,
  disconnectIntegrationAction,
  importHubSpotAction,
  type IntegrationActionState,
} from "./actions";

const initialState: IntegrationActionState = {};

/** Import result stat boxes + duplicate-review samples (mirrors the CSV wizard). */
function ImportResults({ state }: { state: IntegrationActionState }) {
  const summary = state.summary;
  if (!summary) return null;

  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border p-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Fetched</dt>
          <dd className="mt-1 text-2xl font-semibold">{summary.total.toLocaleString()}</dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Created</dt>
          <dd className="mt-1 text-2xl font-semibold text-primary">
            {summary.created.toLocaleString()}
          </dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Duplicates</dt>
          <dd className="mt-1 text-2xl font-semibold text-amber-600">
            {summary.duplicates.toLocaleString()}
          </dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Skipped</dt>
          <dd className="mt-1 text-2xl font-semibold text-muted-foreground">
            {summary.skipped.toLocaleString()}
          </dd>
        </div>
      </dl>

      <p className="text-sm text-green-600">
        Import finished — {summary.created.toLocaleString()} contacts added to your CRM.
      </p>

      {summary.duplicates > 0 ? (
        <div className="rounded-md bg-amber-50 p-3 text-sm">
          <p className="mb-1 font-medium text-amber-900">
            {summary.duplicates} contacts were not imported — they match existing contacts and were
            flagged for review instead of being merged.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-amber-800">
            {summary.samples.map((sample, i) => (
              <li key={i}>
                {sample.value} — {sample.reason}
              </li>
            ))}
            {summary.samples.length < summary.duplicates ? (
              <li>…and {summary.duplicates - summary.samples.length} more.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Link href="/dashboard/contacts" className={buttonVariants({})}>
          View contacts
        </Link>
      </div>
    </div>
  );
}

/** Connected HubSpot account: details + import + disconnect. */
function ConnectedPanel({ integration }: { integration: Integration }) {
  const [importState, importAction, importPending] = useActionState(
    async () => importHubSpotAction(),
    initialState,
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectIntegrationAction,
    initialState,
  );
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const errored = integration.status === "error";

  return (
    <div className="flex flex-col gap-4">
      {errored ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          The last sync failed — HubSpot may have rejected the connection. Try importing again or
          disconnect and reconnect.
        </p>
      ) : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md border bg-muted/20 p-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Account</dt>
          <dd className="mt-1 truncate font-medium">
            {integration.providerAccountName ||
              integration.providerAccountEmail ||
              "HubSpot account"}
          </dd>
          {integration.providerAccountEmail ? (
            <dd className="truncate text-muted-foreground">{integration.providerAccountEmail}</dd>
          ) : null}
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Portal ID</dt>
          <dd className="mt-1 font-mono text-sm">{integration.providerAccountId}</dd>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Last synced</dt>
          <dd className="mt-1 font-medium">
            {integration.lastSyncedAt ? formatDateTime(integration.lastSyncedAt) : "Never"}
          </dd>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Scopes</dt>
          <dd className="mt-1 text-muted-foreground">
            {integration.scopes.length > 0 ? integration.scopes.join(", ") : "—"}
          </dd>
        </div>
      </dl>

      <form action={importAction} className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" loading={importPending}>
          <Download className="size-4" aria-hidden /> Import contacts
        </Button>
        {importState.error ? (
          <p role="alert" className="text-sm text-destructive">
            {importState.error}
          </p>
        ) : null}
      </form>

      {importState.summary ? <ImportResults state={importState} /> : null}

      <div className="border-t pt-4">
        <form action={disconnectAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="provider" value="hubspot" />
          <input type="hidden" name="providerAccountId" value={integration.providerAccountId} />
          {confirmDisconnect ? (
            <>
              <Button type="submit" variant="destructive" size="sm" loading={disconnectPending}>
                {disconnectPending ? "Disconnecting…" : "Yes, disconnect"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDisconnect(false)}
              >
                Keep it
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDisconnect(true)}
            >
              <Trash2 className="size-4" aria-hidden /> Disconnect
            </Button>
          )}
          {disconnectState.error ? (
            <p role="alert" className="text-sm text-destructive">
              {disconnectState.error}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

/** Not connected + env keys present: start OAuth. */
function ConnectPanel() {
  return (
    <form action={connectHubSpotAction}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Sign in with HubSpot to import your contacts. We only request read-only access.
        </p>
        <div>
          <Button type="submit">
            <Link2 className="size-4" aria-hidden /> Connect HubSpot
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Not connected + keys missing: env-gated disabled state. */
function NotConfiguredPanel() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        HubSpot import isn&apos;t available for this workspace yet.
      </p>
      <div>
        <Button type="button" disabled>
          <Link2 className="size-4" aria-hidden /> Connect HubSpot
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Contact your workspace administrator to enable it.
        </p>
      </div>
    </div>
  );
}

export function HubSpotPanel({
  integration,
  configured,
}: {
  integration: Integration | null;
  configured: boolean;
}) {
  const connected = integration !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link2 className="mt-0.5 size-5 text-primary" aria-hidden />
            <div>
              <CardTitle className="text-base">HubSpot</CardTitle>
              <CardDescription>
                Import your HubSpot contacts into ClientLeads. Duplicates are flagged for review,
                never merged.
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={
              connected ? (integration.status === "error" ? "danger" : "success") : "secondary"
            }
          >
            {connected ? (integration.status === "error" ? "Error" : "Connected") : "Not connected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {connected && integration ? (
          <ConnectedPanel integration={integration} />
        ) : configured ? (
          <ConnectPanel />
        ) : (
          <NotConfiguredPanel />
        )}
      </CardContent>
    </Card>
  );
}
