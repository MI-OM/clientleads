"use client";

import { useState } from "react";
import { Clipboard, Download, X } from "lucide-react";
import { SAMPLE_CSV } from "@/lib/crm/sampleCsv";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SampleCsvTemplate() {
  const [showTemplate, setShowTemplate] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowTemplate(true)}
        className={buttonVariants({ variant: "outline" })}
      >
        <Download className="size-4" aria-hidden /> Template
      </button>

      {showTemplate ? (
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
              cols={80}
              className="w-full rounded-md border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              readOnly
              value={SAMPLE_CSV}
              aria-label="CSV template"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowTemplate(false)}
                className={buttonVariants({})}
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
      ) : null}
    </>
  );
}
