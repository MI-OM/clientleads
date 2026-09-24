import { getMyOrg } from "@/lib/auth/org";
import { listActiveCustomFields, listOrgMembers, listTags } from "@/lib/crm/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { ContactForm } from "../contact-form";

export default async function NewContactPage() {
  const ctx = await getMyOrg();
  if (!ctx) return null;

  const [fields, tags, members] = await Promise.all([
    listActiveCustomFields(ctx.org.id),
    listTags(ctx.org.id),
    listOrgMembers(ctx.org.id),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="New contact" description="Add someone to your contact list." />
      <ContactForm mode="create" fields={fields} tags={tags} members={members} />
    </div>
  );
}
