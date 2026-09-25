"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ImportWizard } from "./import-wizard";
import { SampleCsvTemplate } from "./sample-csv-template";

/**
 * Owns the CSV-template toggle so the trigger can sit in the page header while
 * the wide template panel renders in the normal page flow (the header's action
 * slot is a flex row and would squash it).
 */
export function ImportContactsView() {
  const [showTemplate, setShowTemplate] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Import contacts"
        description="Bring your existing contacts into ClientLeads from a CSV."
        actions={
          <button
            type="button"
            onClick={() => setShowTemplate((open) => !open)}
            aria-expanded={showTemplate}
            className={buttonVariants({ variant: "outline" })}
          >
            <Download className="size-4" aria-hidden /> Template
          </button>
        }
      />
      {showTemplate ? <SampleCsvTemplate onClose={() => setShowTemplate(false)} /> : null}
      <ImportWizard />
    </div>
  );
}
