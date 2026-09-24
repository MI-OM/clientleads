import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyOrg } from "@/lib/auth/org";
import { listAutomations } from "@/lib/automations/queries";
import { AUTOMATION_TRIGGERS, AUTOMATION_TRIGGER_LABELS } from "@/lib/automations/types";
import type { AutomationTrigger } from "@/lib/automations/types";
import { AutomationCard } from "./automation-card";
import type { AutomationFormOptions } from "./automation-config-form";
import { listForms } from "@/lib/forms/queries";
import { listServices } from "@/lib/services/queries";
import { listResources } from "@/lib/resources/queries";
import { listTags, listOrgMembers } from "@/lib/crm/queries";
import { listEmailTemplates } from "@/lib/campaigns/queries";

const TRIGGER_DESCRIPTIONS: Record<AutomationTrigger, string> = {
  appointment_booked: "When a visitor books an appointment",
  form_submitted: "When a visitor submits one of your public forms",
  appointment_completed: "When an appointment is marked completed",
  resource_downloaded: "When someone downloads a resource",
  contact_created: "When a contact is added to your CRM",
  lead_stage_changed: "When a lead moves between stages",
  appointment_cancelled: "When an appointment is cancelled",
  appointment_no_show: "When an appointment is marked no-show",
};

export default async function AutomationsPage() {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard");

  const [automations, forms, services, resources, tags, templates, members] = await Promise.all([
    listAutomations(ctx.org.id),
    listForms(ctx.org.id).catch(() => [] as Awaited<ReturnType<typeof listForms>>),
    listServices(ctx.org.id).catch(() => [] as Awaited<ReturnType<typeof listServices>>),
    listResources(ctx.org.id).catch(() => [] as Awaited<ReturnType<typeof listResources>>),
    listTags(ctx.org.id).catch(() => [] as Awaited<ReturnType<typeof listTags>>),
    listEmailTemplates(ctx.org.id).catch(
      () => [] as Awaited<ReturnType<typeof listEmailTemplates>>,
    ),
    listOrgMembers(ctx.org.id).catch(() => [] as Awaited<ReturnType<typeof listOrgMembers>>),
  ]);

  const options: AutomationFormOptions = {
    forms: forms.map((f) => ({ id: f.id, name: f.name })),
    services: services.map((s) => ({ id: s.id, name: s.name })),
    resources: resources.map((r) => ({ id: r.id, name: r.title })),
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
    templates: templates.map((t) => ({ id: t.id, name: t.name })),
    members: members.map((m) => ({ id: m.id, name: m.fullName || m.id })),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Automations"
        description="Workflows that respond to CRM events — follow-ups, tags, emails and notifications."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {AUTOMATION_TRIGGERS.map((trigger) => {
          const automation = automations.find((a) => a.triggerType === trigger) ?? null;
          return automation ? (
            <AutomationCard
              key={trigger}
              automation={automation}
              trigger={trigger}
              description={TRIGGER_DESCRIPTIONS[trigger]}
              options={options}
            />
          ) : (
            <Card key={trigger} className="flex flex-col gap-4">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {AUTOMATION_TRIGGER_LABELS[trigger]}
                    </CardTitle>
                    <CardDescription>{TRIGGER_DESCRIPTIONS[trigger]}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  This trigger isn&apos;t configured yet.
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Your automations run automatically whenever their trigger fires — no manual work needed.
      </p>
    </div>
  );
}
