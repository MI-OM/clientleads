"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeRichHtml, type TemplateSection } from "@/lib/campaigns/template-sections";

const SAMPLE_VALUES: Record<string, string> = {
  first_name: "Alex",
  business_name: "",
  service_name: "Initial consultation",
  appointment_date: "October 14, 2026",
  appointment_time: "10:00 AM",
  booking_link: "https://example.com/book",
  unsubscribe_url: "#unsubscribe-preview",
};

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

function fillVariables(value: string, businessName = ""): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (whole, name: string) => {
      return name === "business_name" ? businessName || whole : (SAMPLE_VALUES[name] ?? whole);
    });
}

interface CampaignPreviewProps {
  subject: string;
  previewText?: string;
  content: string;
  senderName?: string;
  senderEmail?: string;
  imageUrl?: string | null;
  sections?: TemplateSection[];
  bodyBackgroundColor?: string | null;
  footerBusinessName?: string;
  footerAddress?: string[];
  footerUnsubscribeUrl?: string;
  footerAppUrl?: string;
}

export function CampaignPreview({
  subject,
  previewText,
  content,
  senderName = "Your Business",
  senderEmail = "hello@example.com",
  imageUrl = null,
  sections = [],
  bodyBackgroundColor = null,
  footerBusinessName = "Your Business",
  footerAddress = [],
  footerUnsubscribeUrl = SAMPLE_VALUES.unsubscribe_url,
  footerAppUrl = APP_URL,
}: CampaignPreviewProps) {
  const [open, setOpen] = useState(false);
  const previewVariables = (value: string) => fillVariables(value, footerBusinessName);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Eye className="size-4" aria-hidden /> Preview newsletter
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recipient preview
                </p>
                <h2 className="text-lg font-semibold">
                  {previewVariables(subject) || "No subject"}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close preview"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="overflow-y-auto bg-muted/40 p-4 sm:p-8">
              <article className="mx-auto max-w-xl overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="border-b border-border px-5 py-4 text-sm">
                  <p className="font-semibold">{senderName || "Your Business"}</p>
                  <p className="text-xs text-muted-foreground">
                    {senderEmail || "hello@example.com"}
                  </p>
                  {previewText ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {previewVariables(previewText)}
                    </p>
                  ) : null}
                </div>
                <div
                  className="px-5 py-6 sm:px-8 sm:py-8"
                  style={{ backgroundColor: bodyBackgroundColor ?? undefined }}
                >
                  {imageUrl ? (
                    // Email/template images may come from tenant-configured external URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt=""
                      className="mb-6 h-40 w-full rounded-lg object-cover"
                    />
                  ) : null}
                  {sections.length > 0 ? (
                    sections.map((section) => (
                      <div
                        key={section.id}
                        className="mb-6 rounded-md p-2"
                        style={{ backgroundColor: section.backgroundColor ?? undefined }}
                      >
                        {section.eyebrow ? (
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                            {previewVariables(section.eyebrow)}
                          </p>
                        ) : null}
                        {section.title ? (
                          <h3 className="mb-2 text-2xl font-semibold">
                            {previewVariables(section.title)}
                          </h3>
                        ) : null}
                        {section.type === "image" && section.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewVariables(section.imageUrl)}
                            alt={section.imageAlt ?? ""}
                            className="mb-4 w-full rounded-lg"
                          />
                        ) : null}
                        {section.bodyHtml && section.type !== "footer" ? (
                          <div
                            className="prose prose-sm max-w-none leading-7 text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
                            dangerouslySetInnerHTML={{
                              __html: sanitizeRichHtml(previewVariables(section.bodyHtml)),
                            }}
                          />
                        ) : section.body && section.type !== "footer" ? (
                          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                            {previewVariables(section.body)}
                          </p>
                        ) : null}
                        {section.type === "button" ? (
                          <a
                            href={previewVariables(section.buttonUrl ?? "#")}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                          >
                            {previewVariables(section.buttonLabel ?? "Learn more")}
                          </a>
                        ) : null}
                        {section.type === "footer" ? (
                          <div className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
                            {section.bodyHtml ? (
                              <div
                                className="prose prose-xs mx-auto max-w-none text-muted-foreground [&_a]:text-primary [&_a]:underline"
                                dangerouslySetInnerHTML={{
                                  __html: sanitizeRichHtml(previewVariables(section.bodyHtml)),
                                }}
                              />
                            ) : (
                              <p className="whitespace-pre-wrap">
                                {previewVariables(section.body ?? "")}
                              </p>
                            )}
                          </div>
                        ) : null}
                        {section.type === "divider" ? <hr className="border-border" /> : null}
                      </div>
                    ))
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                      {previewVariables(content) || "Your newsletter content will appear here."}
                    </p>
                  )}
                  <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-muted-foreground">
                    <p className="mb-1 font-semibold">{footerBusinessName}</p>
                    {footerAddress.length > 0 ? <p>{footerAddress.join(", ")}</p> : null}
                    <p className="mt-2">
                      <a
                        href={footerUnsubscribeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        Unsubscribe
                      </a>
                      <span className="px-1.5">·</span>
                      <a
                        href={footerAppUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        ClientLeads
                      </a>
                    </p>
                  </footer>
                </div>
              </article>
            </div>
            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close preview
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
