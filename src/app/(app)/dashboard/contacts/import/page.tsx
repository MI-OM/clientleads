import { getMyOrg } from "@/lib/auth/org";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportWizard } from "./import-wizard";

export default async function ImportContactsPage() {
  const ctx = await getMyOrg();

  if (!ctx) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No workspace found</CardTitle>
          <CardDescription>Apply the database migrations, then refresh this page.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Import contacts"
        description="Bring your existing list into ClientLeads from a CSV (PRD §36)."
      />
      <ImportWizard />
    </div>
  );
}
