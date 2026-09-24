import { getMyOrg } from "@/lib/auth/org";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportWizard } from "./import-wizard";
import { SampleCsvTemplate } from "./sample-csv-template";

export default async function ImportContactsPage() {
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Import contacts"
        description="Bring your existing contacts into ClientLeads from a CSV."
      />
      <div className="flex gap-2">
        <SampleCsvTemplate />
        <ImportWizard />
      </div>
    </div>
  );
}
