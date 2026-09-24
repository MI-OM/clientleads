import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, User } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { getLead, listActivities, listOrgMembers } from "@/lib/crm/queries";
import { formatDateTime, formatRelative, money } from "@/lib/crm/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { LeadActions } from "@/components/crm/lead-actions";
import { LeadStageSelect } from "@/components/crm/lead-stage-select";
import { NoteForm } from "@/components/crm/note-form";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getMyOrg();
  const { id } = await params;
  if (!ctx) notFound();

  const [lead, activities, members] = await Promise.all([
    getLead(ctx.org.id, id),
    listActivities(ctx.org.id, { leadId: id }),
    listOrgMembers(ctx.org.id),
  ]);
  if (!lead) notFound();

  const assignee = members.find((m) => m.id === lead.assignedUserId)?.fullName ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={lead.contactName ?? "Unlinked lead"}
        description={`${lead.source} · ${lead.priority} priority`}
        actions={
          <>
            <LeadStageSelect leadId={lead.id} stage={lead.stage} />
            {lead.contactId ? (
              <Link
                href={`/dashboard/contacts/${lead.contactId}`}
                className={buttonVariants({ variant: "outline" })}
              >
                <User className="size-4" aria-hidden /> Contact
              </Link>
            ) : null}
            <Link
              href={`/dashboard/leads/${lead.id}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil className="size-4" aria-hidden /> Edit
            </Link>
            <LeadActions leadId={lead.id} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Add a note</CardTitle>
            </CardHeader>
            <CardContent>
              <NoteForm leadId={lead.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
              <CardDescription>
                Stage changes and updates are recorded automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={activities} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Stage</dt>
                <dd>
                  <Badge variant="outline">{lead.stage}</Badge>
                </dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd>{lead.source}</dd>
                <dt className="text-muted-foreground">Priority</dt>
                <dd>{lead.priority}</dd>
                <dt className="text-muted-foreground">Expected value</dt>
                <dd>{money(lead.expectedValue)}</dd>
                <dt className="text-muted-foreground">Next follow-up</dt>
                <dd>{formatDateTime(lead.nextFollowUpAt)}</dd>
                <dt className="text-muted-foreground">Assigned</dt>
                <dd>{assignee ?? "Unassigned"}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDateTime(lead.createdAt)}</dd>
                <dt className="text-muted-foreground">Updated</dt>
                <dd>{formatRelative(lead.updatedAt)}</dd>
              </dl>
              {lead.notes ? (
                <div className="mt-4 rounded-md bg-muted/60 p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{lead.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
