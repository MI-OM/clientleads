"use client";

import { Clipboard, Download, X } from "lucide-react";
import { SAMPLE_CSV } from "@/lib/crm/sampleCsv";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TEMPLATE_FILENAME = "clientleads-contact-import-template.csv";

/**
 * Saves the template to disk. The file is the exact SAMPLE_CSV text shown in
 * the preview, so a downloaded file and a hand-copied one parse identically.
 */
function downloadTemplate() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = TEMPLATE_FILENAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

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
          Download the template and fill it in, or copy the text below and paste it into your own
          CSV. Columns match the mapping step.
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
          <button type="button" onClick={downloadTemplate} className={buttonVariants({})}>
            <Download className="size-4" aria-hidden /> Download CSV
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
            className={buttonVariants({ variant: "outline" })}
          >
            <Clipboard className="size-4" aria-hidden /> Copy to clipboard
          </button>
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "ghost" })}>
            <X className="size-4" aria-hidden /> Close
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
