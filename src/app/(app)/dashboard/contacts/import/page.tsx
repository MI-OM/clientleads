import { getMyOrg } from "@/lib/auth/org";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportContactsView } from "./import-contacts-view";

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

  return <ImportContactsView />;
}
