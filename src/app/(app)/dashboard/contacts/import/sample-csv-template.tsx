"use client";

import { Clipboard, X } from "lucide-react";
import { SAMPLE_CSV } from "@/lib/crm/sampleCsv";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * CSV template panel. Controlled by the parent so the trigger can live in the
 * page header while the (wide) panel renders in the normal page flow.
 */
export function SampleCsvTemplate({ onClose }: { onClose: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV template</CardTitle>
        <CardDescription>
          Copy the text below and paste it into your CSV uploader. Columns match the mapping step.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <textarea
          rows={15}
          className="w-full rounded-md border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          readOnly
          value={SAMPLE_CSV}
          aria-label="CSV template"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            className={buttonVariants({ variant: "outline" })}
          >
            <X className="size-4" aria-hidden /> Close
          </button>
          <button
            type="button"
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(SAMPLE_CSV).then(() => {
                  alert("Template CSV copied to clipboard!");
                });
              } else {
                alert("Copy the text above manually.");
              }
            }}
            className={buttonVariants({})}
          >
            <Clipboard className="size-4" aria-hidden /> Copy to clipboard
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
