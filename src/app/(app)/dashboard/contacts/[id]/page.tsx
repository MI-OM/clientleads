import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Mail, Phone, Pencil, Target } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import {
  getContact,
  getLeadForContact,
  listActiveCustomFields,
  listActivities,
  listOrgMembers,
  listTags,
} from "@/lib/crm/queries";
import { formatDateTime, formatRelative } from "@/lib/crm/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ContactTags } from "@/components/crm/contact-tags";
import { ContactActions } from "@/components/crm/contact-actions";
import { CustomValuesForm } from "@/components/crm/custom-values-form";
import { NoteForm } from "@/components/crm/note-form";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getMyOrg();
  const { id } = await params;
  if (!ctx) notFound();

  const [contact, lead, activities, fields, tags, members] = await Promise.all([
    getContact(ctx.org.id, id),
    getLeadForContact(ctx.org.id, id),
    listActivities(ctx.org.id, { contactId: id }),
    listActiveCustomFields(ctx.org.id),
    listTags(ctx.org.id),
    listOrgMembers(ctx.org.id),
  ]);
  if (!contact) notFound();

  const memberName = members.find((m) => m.id === contact.assignedUserId)?.fullName ?? null;
  const canDelete = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={contact.name}
        description={
          [
            contact.company,
            contact.city && contact.province && `${contact.city}, ${contact.province}`,
            contact.city && !contact.province && contact.city,
          ]
            .filter(Boolean)
            .join(" · ") || "Contact"
        }
        actions={
          <>
            <ContactActions
              contactId={contact.id}
              archived={Boolean(contact.archivedAt)}
              canDelete={canDelete}
            />
            <Link
              href={
                lead ? `/dashboard/leads/${lead.id}` : `/dashboard/leads/new?contact=${contact.id}`
              }
              className={buttonVariants({ variant: lead ? "outline" : "default" })}
            >
              {lead ? (
                <>
                  <Target className="size-4" aria-hidden /> Lead · {lead.stage}
                </>
              ) : (
                <>
                  <Target className="size-4" aria-hidden /> Create lead
                </>
              )}
            </Link>
            <Link
              href={`/dashboard/contacts/${contact.id}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil className="size-4" aria-hidden /> Edit
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Add a note</CardTitle>
            </CardHeader>
            <CardContent>
              <NoteForm contactId={contact.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
              <CardDescription>
                Every change to this contact is recorded automatically (PRD §13, §38).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={activities} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Type</dt>
                <dd>
                  <Badge variant="outline">{contact.contactType}</Badge>
                </dd>
                <dt className="text-muted-foreground">Lead status</dt>
                <dd>{contact.leadStatus}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd>{contact.source}</dd>
                <dt className="text-muted-foreground">Assigned</dt>
                <dd>{memberName ?? "Unassigned"}</dd>
                {contact.email ? (
                  <>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd>
                      <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                        <Mail className="mr-1 inline size-3.5" aria-hidden />
                        {contact.email}
                      </a>
                    </dd>
                  </>
                ) : null}
                {contact.phone ? (
                  <>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>
                      <a href={`tel:${contact.phone}`} className="hover:underline">
                        <Phone className="mr-1 inline size-3.5" aria-hidden />
                        {contact.phone}
                      </a>
                    </dd>
                  </>
                ) : null}
                {contact.address || contact.city ? (
                  <>
                    <dt className="text-muted-foreground">Address</dt>
                    <dd>
                      {[
                        contact.address,
                        contact.city,
                        contact.province,
                        contact.postalCode,
                        contact.country,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDateTime(contact.createdAt)}</dd>
                <dt className="text-muted-foreground">Updated</dt>
                <dd>{formatRelative(contact.updatedAt)}</dd>
              </dl>
              {contact.notes ? (
                <div className="mt-4 rounded-md bg-muted/60 p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{contact.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactTags contactId={contact.id} tags={contact.tags} allTags={tags} canEdit />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom fields</CardTitle>
              <CardDescription>
                Stored per contact without schema changes (PRD §12, §45).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CustomValuesForm
                contactId={contact.id}
                fields={fields}
                values={contact.customValues}
              />
            </CardContent>
          </Card>

          {lead ? (
            <Card>
              <CardHeader>
                <CardTitle>Lead</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/dashboard/leads/${lead.id}`}
                  className="flex items-center justify-between text-sm font-medium text-primary hover:underline"
                >
                  View this contact&apos;s lead
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
