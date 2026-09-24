"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, MailX } from "lucide-react";
import { confirmUnsubscribeAction, type UnsubscribeState } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";

const initialState: UnsubscribeState = {};

export function UnsubscribePanel({
  slug,
  token,
  orgName,
  firstName,
  alreadyUnsubscribed,
}: {
  slug: string;
  token: string;
  orgName: string;
  firstName: string;
  alreadyUnsubscribed: boolean;
}) {
  const [state, formAction, pending] = useActionState(confirmUnsubscribeAction, initialState);

  const done = alreadyUnsubscribed || state.ok;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-accent/40 p-6">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <MailX className="size-5 text-primary" aria-hidden />
            Unsubscribe
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{orgName}</p>
        </div>

        <div className="p-6">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="size-10 text-green-600" aria-hidden />
              <p className="font-medium">
                {firstName ? `You&apos;re all set, ${firstName}.` : "You&apos;re all set."}
              </p>
              <p className="text-sm text-muted-foreground">
                {alreadyUnsubscribed
                  ? "You were already unsubscribed from marketing emails."
                  : "You&apos;ll stop receiving marketing emails from this business."}
              </p>
            </div>
          ) : (
            <form action={formAction} className="flex flex-col gap-4">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="token" value={token} />
              <p className="text-sm text-muted-foreground">
                {firstName ? `Hi ${firstName} — ` : ""}
                click below to stop receiving marketing emails from {orgName}. Transactional
                messages about things you&apos;ve booked stay on.
              </p>
              {state.error ? (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {state.error}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <Button type="submit" variant="destructive" loading={pending}>
                  {pending ? "Unsubscribing…" : "Unsubscribe me"}
                </Button>
                <Link href={`/${slug}`} className={buttonVariants({ variant: "ghost" })}>
                  Keep receiving emails
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
