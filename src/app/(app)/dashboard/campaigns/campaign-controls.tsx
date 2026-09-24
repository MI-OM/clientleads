"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Send, XCircle } from "lucide-react";
import {
  cancelCampaignAction,
  scheduleCampaignAction,
  sendCampaignNowAction,
  type CampaignActionState,
} from "./actions";
import type { Campaign } from "@/lib/campaigns/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: CampaignActionState = {};

function StatusLine({ state }: { state: CampaignActionState }) {
  if (!state.error && !state.ok) return null;
  return (
    <p
      className={`mt-2 text-sm ${state.error ? "text-destructive" : "text-green-600"}`}
      role={state.error ? "alert" : "status"}
    >
      {state.error ?? state.info ?? "Done."}
    </p>
  );
}

export function CampaignControls({
  campaign,
  slug,
  timeZone,
}: {
  campaign: Campaign;
  slug: string;
  timeZone: string;
}) {
  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    scheduleCampaignAction,
    initialState,
  );
  const [sendState, sendAction, sendPending] = useActionState(sendCampaignNowAction, initialState);
  const [cancelState, cancelStateAction, cancelPending] = useActionState(
    cancelCampaignAction,
    initialState,
  );
  const [confirmCancel, setConfirmCancel] = useState(false);

  const editable = campaign.status === "Draft" || campaign.status === "Scheduled";
  if (!editable) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {campaign.status === "Draft" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" aria-hidden /> Schedule
            </CardTitle>
            <CardDescription>
              Set a send time. The campaign flips to Scheduled until the send fires.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={scheduleAction} className="flex flex-col gap-3">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <input type="hidden" name="timeZone" value={timeZone} />
              <input
                type="datetime-local"
                name="scheduledFor"
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm"
              />
              <div>
                <p className="text-xs text-muted-foreground">Time zone: {timeZone}</p>
                <Button type="submit" loading={schedulePending}>
                  Schedule campaign
                </Button>
              </div>
              <StatusLine state={scheduleState} />
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="size-4 text-primary" aria-hidden /> Send now
          </CardTitle>
          <CardDescription>
            Resolves the audience (unsubscribed contacts are skipped) and fires the Resend loop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendAction} className="flex flex-col gap-3">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="slug" value={slug} />
            <div>
              <Button type="submit" variant="secondary" loading={sendPending}>
                Send to audience now
              </Button>
            </div>
            <StatusLine state={sendState} />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="size-4" aria-hidden /> Cancel campaign
          </CardTitle>
          <CardDescription>
            Stops a scheduled or in-flight campaign. Can&apos;t be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cancelState.error ? (
            <p
              role="alert"
              className="mb-2 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {cancelState.error}
            </p>
          ) : null}
          <form action={cancelStateAction} className="flex items-center gap-2">
            <input type="hidden" name="campaignId" value={campaign.id} />
            {confirmCancel ? (
              <>
                <Button type="submit" variant="destructive" loading={cancelPending}>
                  {cancelPending ? "Cancelling…" : "Yes, cancel it"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmCancel(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmCancel(true)}
              >
                Cancel campaign
              </Button>
            )}
          </form>
          {cancelState.ok ? (
            <p className="mt-2 text-sm text-green-600">{cancelState.info ?? "Cancelled."}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
