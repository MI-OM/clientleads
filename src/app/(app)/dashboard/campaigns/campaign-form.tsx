"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createCampaignAction, updateCampaignAction } from "./actions";
import type { CampaignActionState } from "./actions";
import type { Campaign, EmailTemplate } from "@/lib/campaigns/types";
import { TEMPLATE_VARIABLES } from "@/lib/campaigns/constants";
import type { Tag, CustomField } from "@/lib/crm/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CampaignPreview } from "./campaign-preview";

interface CustomRow {
  key: string;
  operator: "eq" | "ne" | "contains";
  value: string;
}

interface CampaignFormProps {
  campaign?: Campaign;
  tags: Tag[];
  customFields: CustomField[];
  contactTypes: string[];
  templates: EmailTemplate[];
  organizationName: string;
  organizationAddress: string[];
  appUrl: string;
}

function FormStatus({ state }: { state: CampaignActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

const VARIABLE_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function CampaignForm({
  campaign,
  tags,
  customFields,
  contactTypes,
  templates,
  organizationName,
  organizationAddress,
  appUrl,
}: CampaignFormProps) {
  const [state, formAction, pending] = useActionState<CampaignActionState, FormData>(
    campaign ? updateCampaignAction : createCampaignAction,
    {},
  );

  const defaultAudience = campaign?.audience;
  const initialScope =
    defaultAudience && defaultAudience.scope !== "all" ? defaultAudience.scope : "all";
  const [scope, setScope] = useState<string>(initialScope);

  const initialRows: CustomRow[] =
    defaultAudience && defaultAudience.scope === "custom"
      ? defaultAudience.custom_fields.map((f) => ({
          key: f.field_key,
          operator: f.operator,
          value: f.value,
        }))
      : [{ key: "", operator: "eq", value: "" }];
  const [rows, setRows] = useState<CustomRow[]>(initialRows);

  const [content, setContent] = useState(campaign?.content ?? "");
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [previewText, setPreviewText] = useState(campaign?.previewText ?? "");
  const [senderName, setSenderName] = useState(campaign?.senderName ?? "ClientLeads");
  const [senderEmail, setSenderEmail] = useState(campaign?.senderEmail ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(campaign?.imageUrl ?? null);
  const [sections, setSections] = useState(campaign?.sections ?? []);
  const [bodyBackgroundColor, setBodyBackgroundColor] = useState(
    campaign?.bodyBackgroundColor ?? "#ffffff",
  );

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const selected = templates.find((item) => item.id === id);
    if (!selected) return;
    setSubject(selected.subject);
    setContent(selected.body);
    setImageUrl(selected.imageUrl);
    setSections(selected.sections);
    setBodyBackgroundColor(selected.bodyBackgroundColor ?? "#ffffff");
  };

  function usedVariables(): string[] {
    const vars = new Set<string>();
    for (const m of content.matchAll(VARIABLE_RE)) vars.add(m[1]);
    return [...vars].sort();
  }

  const scopeLabel = (scope: string) =>
    scope === "all"
      ? "All opted-in contacts"
      : scope === "tags"
        ? "All contacts with every selected tag"
        : scope === "contact_type"
          ? "Contacts of a specific type"
          : "Contacts whose custom fields match";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}
      <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />
      <input type="hidden" name="sections" value={JSON.stringify(sections)} />
      <input type="hidden" name="bodyBackgroundColor" value={bodyBackgroundColor} />

      <Card>
        <CardHeader>
          <CardTitle>Campaign details</CardTitle>
          <CardDescription>
            What your recipients see. Use {"{{"}variables{"}"} like {"{{first_name}}"} and{" "}
            {"{{unsubscribe_url}}"} to personalize (PRD §25–26).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {templates.length > 0 ? (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="templateId">Start from a template</Label>
                <Select
                  id="templateId"
                  value={selectedTemplateId}
                  onChange={(event) => applyTemplate(event.target.value)}
                >
                  <option value="">Start from scratch</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choosing a template fills the subject and body. You can customize them before
                  saving.
                </p>
              </div>
            ) : null}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="name">Campaign name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={campaign?.name ?? ""}
                placeholder="e.g. October newsletter"
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="subject">Email subject</Label>
              <Input
                id="subject"
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. New this month at {{business_name}}"
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="previewText">Preview text</Label>
              <Input
                id="previewText"
                name="previewText"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="Shown after the subject in most inboxes"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="senderName">Sender name</Label>
              <Input
                id="senderName"
                name="senderName"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="senderEmail">Sender email</Label>
              <Input
                id="senderEmail"
                name="senderEmail"
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="you@yourdomain.com"
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="content">Email body</Label>
            <Textarea
              id="content"
              name="content"
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Hi {{first_name}},\n\nWelcome to {{business_name}}!\n\n{{unsubscribe_url}}`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Available variables:</span>
              {TEMPLATE_VARIABLES.map((v) => (
                <code key={v} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {"{{"}
                  {v}
                  {"}}"}
                </code>
              ))}
            </div>
            {usedVariables().length > 0 ? (
              <p className="text-xs text-muted-foreground">
                This body uses: {usedVariables().join(", ")}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audience</CardTitle>
          <CardDescription>
            Who this campaign reaches. Unsubscribed and opted-out contacts are always excluded (PRD
            §29).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="audienceScope">Audience scope</Label>
            <Select
              id="audienceScope"
              name="audienceScope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="all">Everyone (opted-in)</option>
              <option value="tags">By tags</option>
              <option value="contact_type">By contact type</option>
              <option value="custom">By custom fields</option>
            </Select>
            <p className="text-xs text-muted-foreground">{scopeLabel(scope)}</p>
          </div>

          {scope === "tags" ? (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium leading-none">
                Tags (AND — all required)
              </legend>
              {tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tags yet. Add tags to your contacts first.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="audienceTag"
                        value={tag.id}
                        defaultChecked={
                          campaign?.audience.scope === "tags"
                            ? campaign.audience.tags.includes(tag.id)
                            : false
                        }
                        className="size-4 rounded border-input accent-[var(--primary)]"
                      />
                      {tag.name}
                      <span className="text-xs text-muted-foreground">
                        ({tag.contactCount} contacts)
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ) : null}

          {scope === "contact_type" ? (
            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="audienceContactType">Contact type</Label>
              <Select
                id="audienceContactType"
                name="audienceContactType"
                defaultValue={
                  campaign?.audience.scope === "contact_type"
                    ? campaign.audience.contact_type
                    : (contactTypes[0] ?? "Lead")
                }
              >
                {contactTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {scope === "custom" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Custom field filters (all rules must match)</p>
              {customFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active custom fields yet. Add them under Custom fields in your settings.
                </p>
              ) : (
                rows.map((row, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_10rem_1fr_auto]">
                    <div className="grid gap-1">
                      <Label htmlFor={`customFieldKey-${index}`}>Field</Label>
                      <Select
                        id={`customFieldKey-${index}`}
                        name="customFieldKey"
                        value={row.key}
                        onChange={(e) => {
                          const next = [...rows];
                          next[index] = { ...next[index], key: e.target.value };
                          setRows(next);
                        }}
                      >
                        <option value="">Pick a field…</option>
                        {customFields.map((f) => (
                          <option key={f.id} value={f.fieldKey}>
                            {f.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`customOperator-${index}`}>Operator</Label>
                      <Select
                        id={`customOperator-${index}`}
                        name="customOperator"
                        value={row.operator}
                        onChange={(e) => {
                          const next = [...rows];
                          next[index] = {
                            ...next[index],
                            operator: e.target.value as CustomRow["operator"],
                          };
                          setRows(next);
                        }}
                      >
                        <option value="eq">is</option>
                        <option value="ne">is not</option>
                        <option value="contains">contains</option>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`customValue-${index}`}>Value</Label>
                      <Input
                        id={`customValue-${index}`}
                        name="customValue"
                        value={row.value}
                        onChange={(e) => {
                          const next = [...rows];
                          next[index] = { ...next[index], value: e.target.value };
                          setRows(next);
                        }}
                        placeholder="e.g. Halifax"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setRows((prev) =>
                            prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
                          )
                        }
                        aria-label="Remove filter"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ))
              )}
              {rows.length < 5 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    setRows((prev) => [...prev, { key: "", operator: "eq", value: "" }])
                  }
                >
                  <Plus className="size-3.5" aria-hidden /> Add filter
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <FormStatus state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <CampaignPreview
          subject={subject}
          previewText={previewText}
          content={content}
          imageUrl={imageUrl}
          sections={sections}
          bodyBackgroundColor={bodyBackgroundColor}
          senderName={senderName}
          senderEmail={senderEmail}
          footerBusinessName={organizationName}
          footerAddress={organizationAddress}
          footerAppUrl={appUrl}
        />
        <Button type="submit" loading={pending}>
          {campaign ? "Save changes" : "Create campaign"}
        </Button>
      </div>
    </form>
  );
}
