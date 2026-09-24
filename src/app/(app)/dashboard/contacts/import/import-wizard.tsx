"use client";

import { useState } from "react";
import Link from "next/link";
import { UploadCloud } from "lucide-react";
import { importContactsCsvAction } from "@/lib/crm/actions";
import type { CrmState } from "@/lib/crm/actions";
import { parseCsv } from "@/lib/csv";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** CSV columns a user can map (PRD §36). */
const MAPPABLE = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "address", label: "Street address" },
  { key: "city", label: "City" },
  { key: "province", label: "Province / State" },
  { key: "country", label: "Country" },
  { key: "postalCode", label: "Postal / ZIP" },
  { key: "contactType", label: "Contact type" },
  { key: "source", label: "Source" },
  { key: "notes", label: "Notes" },
  { key: "tags", label: "Tags (split by ; or |)" },
] as const;

/** Header-name synonyms for auto-mapping. */
const SYNONYMS: Record<string, string[]> = {
  firstName: ["first_name", "firstname", "first name", "given name"],
  lastName: ["last_name", "lastname", "last name", "surname", "family name"],
  email: ["email", "email address", "e-mail", "mail"],
  phone: ["phone", "telephone", "phone number", "mobile", "cell", "tel"],
  company: ["company", "organization", "business", "employer"],
  address: ["address", "street", "street address"],
  city: ["city", "town"],
  province: ["province", "state", "region", "province/state"],
  country: ["country"],
  postalCode: ["postal", "postal code", "zip", "zip code", "postcode"],
  contactType: ["contact type", "type", "contact_type"],
  source: ["source", "lead source"],
  notes: ["notes", "note", "comments"],
  tags: ["tags", "tag"],
};

export function ImportWizard() {
  const [step, setStep] = useState<"upload" | "mapping">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [result, setResult] = useState<CrmState | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (file: File) => {
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);

      const auto: Record<string, number> = {};
      for (const col of MAPPABLE) {
        const idx = parsed.headers.findIndex((h) => {
          const normalized = h.toLowerCase().trim();
          return SYNONYMS[col.key]?.includes(normalized) ?? false;
        });
        if (idx >= 0) auto[col.key] = idx;
      }
      setMapping(auto);
      setStep("mapping");
    };
    reader.readAsText(file);
  };

  const runImport = async () => {
    setBusy(true);
    const payload = new FormData();
    payload.set("fileName", fileName || "upload.csv");
    // Send our parsed + re-serialized text so client preview and server
    // import share the exact same rows and quoting rules.
    payload.set("csvText", serialize());
    payload.set("mappingJson", JSON.stringify(mapping));
    const res = await importContactsCsvAction({}, payload);
    setResult(res);
    setBusy(false);
  };

  /** Reconstruct source text from the parsed rows (honors quoting). */
  const serialize = () =>
    headers.join(",") + "\r\n" + rows.map((r) => r.map(esc).join(",")).join("\r\n");

  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

  const preview = rows.slice(0, 5);

  if (result?.import) {
    const summary = result.import;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import results</CardTitle>
          <CardDescription>
            <span className="font-mono">{summary.file}</span> — {summary.total.toLocaleString()}{" "}
            rows
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            <div className="rounded-md border p-3">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Total rows</dt>
              <dd className="mt-1 text-2xl font-semibold">{summary.total.toLocaleString()}</dd>
            </div>
          </dl>
          {summary.duplicates > 0 ? (
            <div className="rounded-md bg-amber-50 p-3 text-sm">
              <p className="mb-1 font-medium text-amber-900">
                {summary.duplicates} rows were not imported — they match existing contacts and were
                flagged for review instead of being merged.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-amber-800">
                {summary.samples.map((sample, i) => (
                  <li key={i}>
                    Row {sample.row}: {sample.value} — {sample.reason}
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
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setStep("upload");
              }}
              className={buttonVariants({ variant: "outline" })}
            >
              Import another file
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "mapping") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Map columns</CardTitle>
          <CardDescription>
            Match your file&apos;s columns to contact fields. Unmatched columns are ignored.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2 text-sm">
            <p>
              <span className="font-medium">{fileName}</span> · {rows.length.toLocaleString()} data
              rows · {headers.length} columns
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {MAPPABLE.map((col) => (
              <label key={col.key} className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">{col.label}</span>
                <select
                  value={mapping[col.key] ?? -1}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setMapping((m) => {
                      const next = { ...m };
                      if (idx < 0) delete next[col.key];
                      else next[col.key] = idx;
                      return next;
                    });
                  }}
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value={-1}>— Skip —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h} {i === mapping[col.key] ? "✓" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left uppercase tracking-wider text-muted-foreground">
                  {headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, ri) => (
                  <tr key={ri} className="border-b last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className="max-w-40 truncate px-3 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={runImport}
              className={buttonVariants({}) + " disabled:opacity-60"}
            >
              {busy ? "Importing…" : "Import contacts"}
            </button>
            <button
              type="button"
              onClick={() => setStep("upload")}
              className={buttonVariants({ variant: "ghost" })}
            >
              Back
            </button>
            {result?.error ? <p className="text-sm text-destructive">{result.error}</p> : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a CSV</CardTitle>
        <CardDescription>
          Contacts are matched against existing rows by email, then phone. Nothing is ever merged
          automatically — duplicates are flagged for review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center hover:bg-muted/40">
          <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">Choose a CSV file</span>
          <span className="text-xs text-muted-foreground">First row must be column headers</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </label>
      </CardContent>
    </Card>
  );
}
