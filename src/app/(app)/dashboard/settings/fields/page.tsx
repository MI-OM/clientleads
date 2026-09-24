import { getMyOrg } from "@/lib/auth/org";
import { listAllCustomFields } from "@/lib/crm/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomFieldsForm } from "./fields-form";

export default async function CustomFieldsSettingsPage() {
  const ctx = await getMyOrg();
  if (!ctx) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No workspace found</CardTitle>
          <CardDescription>Your account isn&apos;t linked to an organization yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fields = await listAllCustomFields(ctx.org.id, "contact");
  const canManage = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Custom fields"
        description="Add industry-specific fields that appear on every contact."
      />
      <CustomFieldsForm fields={fields} canManage={canManage} />
    </div>
  );
}
