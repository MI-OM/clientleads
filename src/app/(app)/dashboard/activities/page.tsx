import { getMyOrg } from "@/lib/auth/org";
import { listActivitiesPage } from "@/lib/crm/queries";
import { Pagination } from "@/components/dashboard/pagination";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import Link from "next/link";

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
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

  const params = await searchParams;
  const page = Number.parseInt(Array.isArray(params.page) ? params.page[0] ?? "" : params.page ?? "", 10) || 1;
  const result = await listActivitiesPage(ctx.org.id, page);
  const activities = result.activities;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description="The latest changes across your workspace (PRD §38)."
      />
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            System-recorded events from contacts, leads, notes and tags.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityTimeline
            activities={activities}
            emptyTitle="Nothing yet"
            emptyDescription="Activity appears here as contacts and leads change."
          />
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Showing page {page} of the workspace activity.{" "}
        <Link href="/dashboard/contacts" className="text-primary hover:underline">
          Browse contacts
        </Link>{" "}
        to see per-contact timelines.
      </p>
      <Pagination page={page} totalPages={result.totalPages} href={(target) => `/dashboard/activities?page=${target}`} />
    </div>
  );
}
