import { getMyOrg } from "@/lib/auth/org";
import { listActivities } from "@/lib/crm/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import Link from "next/link";

export default async function ActivitiesPage() {
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

  const activities = await listActivities(ctx.org.id, { limit: 100 });

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
        Showing the {activities.length} most recent events.{" "}
        <Link href="/dashboard/contacts" className="text-primary hover:underline">
          Browse contacts
        </Link>{" "}
        to see per-contact timelines.
      </p>
    </div>
  );
}
