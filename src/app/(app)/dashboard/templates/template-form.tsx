"use client";

import { useActionState, useState } from "react";
import { createTemplateAction, updateTemplateAction } from "./actions";
import type { TemplateActionState } from "./actions";
import type { EmailTemplate } from "@/lib/campaigns/types";
import { TEMPLATE_VARIABLES } from "@/lib/campaigns/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SECTION_TYPES,
  type TemplateSection,
  type TemplateSectionType,
} from "@/lib/campaigns/template-sections";
import { RichTextEditor } from "./rich-text-editor";

interface TemplateFormProps {
  template?: EmailTemplate;
}

function FormStatus({ state }: { state: TemplateActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

const VARIABLE_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function TemplateForm({ template }: TemplateFormProps) {
  const [state, formAction, pending] = useActionState<TemplateActionState, FormData>(
    template ? updateTemplateAction : createTemplateAction,
    {},
  );
  const [body, setBody] = useState(template?.body ?? "");
  const [sections, setSections] = useState<TemplateSection[]>(template?.sections ?? []);
  const [bodyBackgroundColor, setBodyBackgroundColor] = useState(
    template?.bodyBackgroundColor ?? "#ffffff",
  );

  const addSection = (type: TemplateSectionType) => {
    setSections((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type,
        title: type === "divider" ? undefined : "",
        body: "",
        bodyHtml: "",
      },
    ]);
  };

  const used = (() => {
    const vars = new Set<string>();
    for (const m of body.matchAll(VARIABLE_RE)) vars.add(m[1]);
    return [...vars].sort();
  })();

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <input type="hidden" name="sections" value={JSON.stringify(sections)} />
      <input type="hidden" name="bodyBackgroundColor" value={bodyBackgroundColor} />

      <Card>
        <CardHeader>
          <CardTitle>Template</CardTitle>
          <CardDescription>
            Reusable emails for campaigns. Use {"{{variables}}"} to personalize — include{" "}
            {"{{unsubscribe_url}}"} so recipients can opt out (PRD §25).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            Newsletter background
            <Input
              type="color"
              value={bodyBackgroundColor}
              onChange={(event) => setBodyBackgroundColor(event.target.value)}
              className="size-8 cursor-pointer border-0 p-0"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Template name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={template?.name ?? ""}
                placeholder="e.g. Welcome email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subject">Email subject</Label>
              <Input
                id="subject"
                name="subject"
                defaultValue={template?.subject ?? ""}
                placeholder="e.g. Welcome to {{business_name}}!"
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="body">Email body</Label>
            <Textarea
              id="body"
              name="body"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Hi {{first_name}},\n\nWelcome to {{business_name}}!\n\n{{unsubscribe_url}}`}
              required
            />
            <div className="flex flex-wrap gap-2">
              <span className="text-xs leading-6 text-muted-foreground">Available variables:</span>
              {TEMPLATE_VARIABLES.map((v) => (
                <code key={v} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {"{{"}
                  {v}
                  {"}}"}
                </code>
              ))}
            </div>
            {used.length > 0 ? (
              <p className="text-xs text-muted-foreground">This template uses: {used.join(", ")}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="image">Header image</Label>
            <Input
              id="image"
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
            />
            <p className="text-xs text-muted-foreground">
              Optional image, up to 10 MB. It is stored with your organization assets.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Design sections</CardTitle>
          <CardDescription>
            Build a polished email from reusable blocks. Drag-and-drop ordering can be added later;
            use the arrows to arrange sections now.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sections.map((section, index) => (
            <div key={section.id} className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold capitalize">{section.type} section</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() =>
                      setSections((items) => {
                        const next = [...items];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        return next;
                      })
                    }
                    className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    disabled={index === sections.length - 1}
                    onClick={() =>
                      setSections((items) => {
                        const next = [...items];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        return next;
                      })
                    }
                    className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSections((items) => items.filter((item) => item.id !== section.id))
                    }
                    className="rounded border px-2 py-1 text-xs text-destructive"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {section.type !== "divider" ? (
                <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  Section background
                  <Input
                    type="color"
                    value={section.backgroundColor ?? "#ffffff"}
                    onChange={(event) =>
                      setSections((items) =>
                        items.map((item) =>
                          item.id === section.id
                            ? { ...item, backgroundColor: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="size-7 cursor-pointer border-0 p-0"
                  />
                </label>
              ) : null}
              {section.type !== "divider" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {section.type === "hero" || section.type === "text" ? (
                    <Input
                      placeholder="Heading"
                      value={section.title ?? ""}
                      onChange={(event) =>
                        setSections((items) =>
                          items.map((item) =>
                            item.id === section.id ? { ...item, title: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  ) : null}
                  {section.type === "image" ? (
                    <div className="grid gap-1 sm:col-span-2">
                      <Input
                        name={`sectionImage_${section.id}`}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      />
                      <Input
                        placeholder="https://example.com/image.jpg"
                        value={section.imageUrl ?? ""}
                        onChange={(event) =>
                          setSections((items) =>
                            items.map((item) =>
                              item.id === section.id
                                ? { ...item, imageUrl: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Upload an image for reliable delivery, or use a public HTTPS image URL.
                        Uploaded images are copied to your workspace assets when saved.
                      </p>
                    </div>
                  ) : null}
                  {section.type === "button" ? (
                    <>
                      <Input
                        placeholder="Button label"
                        value={section.buttonLabel ?? ""}
                        onChange={(event) =>
                          setSections((items) =>
                            items.map((item) =>
                              item.id === section.id
                                ? { ...item, buttonLabel: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                      <Input
                        placeholder="https://example.com"
                        value={section.buttonUrl ?? ""}
                        onChange={(event) =>
                          setSections((items) =>
                            items.map((item) =>
                              item.id === section.id
                                ? { ...item, buttonUrl: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </>
                  ) : null}
                  {section.type !== "button" && section.type !== "image" ? (
                    <div className="sm:col-span-2">
                      <RichTextEditor
                        value={section.bodyHtml ?? section.body ?? ""}
                        onChange={(value) =>
                          setSections((items) =>
                            items.map((item) =>
                              item.id === section.id
                                ? { ...item, bodyHtml: value, body: value.replace(/<[^>]+>/g, "") }
                                : item,
                            ),
                          )
                        }
                        placeholder={
                          section.type === "bullets"
                            ? "Add a bullet, then use the bullet-list button for more points"
                            : "Section copy"
                        }
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {SECTION_TYPES.map((entry) => (
              <Button
                key={entry.type}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSection(entry.type)}
              >
                + {entry.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <FormStatus state={state} />
      <div>
        <Button type="submit" loading={pending}>
          {template ? "Save changes" : "Create template"}
        </Button>
      </div>
    </form>
  );
}
