import { notFound } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { getContact, listActiveCustomFields, listOrgMembers, listTags } from "@/lib/crm/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import type { Contact } from "@/lib/crm/types";
import { ContactForm } from "../../contact-form";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getMyOrg();
  const { id } = await params;
  if (!ctx) notFound();

  const [contact, fields, tags, members] = await Promise.all([
    getContact(ctx.org.id, id),
    listActiveCustomFields(ctx.org.id),
    listTags(ctx.org.id),
    listOrgMembers(ctx.org.id),
  ]);
  if (!contact) notFound();

  const initial: Contact = { ...contact };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={`Edit ${contact.name}`} description="Update contact details." />
      <ContactForm mode="edit" fields={fields} tags={tags} members={members} initial={initial} />
    </div>
  );
}
