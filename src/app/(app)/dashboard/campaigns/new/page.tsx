import { redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { listTags, listActiveCustomFields } from "@/lib/crm/queries";
import { listEmailTemplates } from "@/lib/campaigns/queries";
import { CONTACT_TYPES } from "@/lib/crm/constants";
import { CampaignForm } from "../campaign-form";
import { PageHeader } from "@/components/dashboard/page-header";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export default async function NewCampaignPage() {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/campaigns");

  const [tags, customFields, templates] = await Promise.all([
    listTags(ctx.org.id),
    listActiveCustomFields(ctx.org.id),
    listEmailTemplates(ctx.org.id),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="New campaign"
        description="Choose an audience and draft your email. Unsubscribed contacts are always excluded."
      />
      <CampaignForm
        tags={tags}
        customFields={customFields}
        contactTypes={[...CONTACT_TYPES]}
        templates={templates}
        organizationName={ctx.org.name}
        organizationAddress={[
          ctx.org.address,
          ctx.org.city,
          ctx.org.province,
          ctx.org.country,
          ctx.org.postalCode,
        ].filter((value): value is string => Boolean(value?.trim()))}
        appUrl={appUrl}
      />
    </div>
  );
}
