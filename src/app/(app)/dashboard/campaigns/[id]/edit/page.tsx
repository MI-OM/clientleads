import { notFound, redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { getCampaign, listEmailTemplates } from "@/lib/campaigns/queries";
import { listTags, listActiveCustomFields } from "@/lib/crm/queries";
import { CONTACT_TYPES } from "@/lib/crm/constants";
import { CampaignForm } from "../../campaign-form";
import { PageHeader } from "@/components/dashboard/page-header";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

interface EditCampaignPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCampaignPage({ params }: EditCampaignPageProps) {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/campaigns");

  const { id } = await params;
  const campaign = await getCampaign(ctx.org.id, id);
  if (!campaign) notFound();

  // Only Draft campaigns are editable (the state machine owns the rest).
  if (campaign.status !== "Draft") {
    redirect(`/dashboard/campaigns/${campaign.id}`);
  }

  const [tags, customFields, templates] = await Promise.all([
    listTags(ctx.org.id),
    listActiveCustomFields(ctx.org.id),
    listEmailTemplates(ctx.org.id),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={`Edit: ${campaign.name}`}
        description="Update the campaign details, audience and content while it's still a draft."
      />
      <CampaignForm
        campaign={campaign}
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
