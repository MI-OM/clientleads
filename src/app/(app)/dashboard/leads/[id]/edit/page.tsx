import { notFound } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { getLead, listContactOptions, listOrgMembers } from "@/lib/crm/queries";
import type { Lead } from "@/lib/crm/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { LeadForm } from "../../lead-form";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getMyOrg();
  const { id } = await params;
  if (!ctx) notFound();

  const [lead, contacts, members] = await Promise.all([
    getLead(ctx.org.id, id),
    listContactOptions(ctx.org.id),
    listOrgMembers(ctx.org.id),
  ]);
  if (!lead) notFound();

  const initial: Lead = { ...lead };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={`Edit ${lead.contactName ?? "lead"}`} description="Update lead details." />
      <LeadForm
        mode="edit"
        contacts={contacts}
        members={members}
        initial={initial}
        timezone={ctx.org.timezone}
      />
    </div>
  );
}
