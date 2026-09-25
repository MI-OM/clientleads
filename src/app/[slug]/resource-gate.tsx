"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Download, Lock } from "lucide-react";
import { requestResourceAction, type PublicFormState } from "./actions";
import type { PublicResource } from "@/lib/public/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Gated resources ask for name/email/phone before the download starts
 * (PRD §31). Non-gated resources are plain download links.
 */
export function ResourceDownload({
  resource,
  pageSlug,
}: {
  resource: PublicResource;
  pageSlug: string;
}) {
  const [state, formAction, pending] = useActionState<PublicFormState, FormData>(
    requestResourceAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [state.redirectTo, router]);

  const downloadLink = `/api/public/resources/${resource.id}/download`;

  if (!resource.gated) {
    return (
      <a
        href={downloadLink}
        className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
        style={{ backgroundColor: "var(--brand)" }}
      >
        <Download className="size-4" aria-hidden /> Download
      </a>
    );
  }

  if (state.success) {
    return <p className="text-sm text-muted-foreground">{state.success}</p>;
  }

  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Lock className="size-3.5" aria-hidden /> Enter your details to download
      </p>
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="resource_id" value={resource.id} />
        <input type="hidden" name="page_slug" value={pageSlug} />
        <div className="absolute -left-[9999px] top-0" aria-hidden>
          <label htmlFor="company_website">Leave this field empty</label>
          <input
            id="company_website"
            name="company_website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`name-${resource.id}`} className="text-xs">
            Name
          </Label>
          <Input
            id={`name-${resource.id}`}
            name="name"
            required
            autoComplete="name"
            className="h-9"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`email-${resource.id}`} className="text-xs">
            Email
          </Label>
          <Input
            id={`email-${resource.id}`}
            name="email"
            type="email"
            required
            autoComplete="email"
            className="h-9"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`phone-${resource.id}`} className="text-xs">
            Phone <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`phone-${resource.id}`}
            name="phone"
            type="tel"
            autoComplete="tel"
            className="h-9"
          />
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {state.error}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button
            type="submit"
            loading={pending}
            size="sm"
            style={{ backgroundColor: "var(--brand)" }}
          >
            <Download className="size-4" aria-hidden /> Get download link
          </Button>
        </div>
      </form>
    </div>
  );
}
