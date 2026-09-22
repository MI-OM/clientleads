import { getMyOrg } from "@/lib/auth/org";
import { listContactOptions, listOrgMembers } from "@/lib/crm/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { LeadForm } from "../lead-form";

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string | string[] }>;
}) {
  const ctx = await getMyOrg();
  const params = await searchParams;
  if (!ctx) return null;

  const [contacts, members] = await Promise.all([
    listContactOptions(ctx.org.id),
    listOrgMembers(ctx.org.id),
  ]);
  const preselect = Array.isArray(params.contact) ? params.contact[0] : params.contact;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="New lead" description="Create a lead linked to a contact (PRD §14)." />
      <LeadForm
        mode="create"
        contacts={contacts}
        members={members}
        preselectContactId={preselect}
      />
    </div>
  );
}
