import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { getCampaign, listCampaignRecipients, describeAudience } from "@/lib/campaigns/queries";
import type { Campaign, CampaignRecipient } from "@/lib/campaigns/types";
import { CAMPAIGN_STATUS_LABELS, RECIPIENT_STATUS_LABELS } from "@/lib/campaigns/constants";
import { deleteCampaignAction } from "../actions";
import { CampaignControls } from "../campaign-controls";
import { CampaignPreview } from "../campaign-preview";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

interface CampaignDetailPageProps {
  params: Promise<{ id: string }>;
}

const CAMPAIGN_STATUS_VARIANT: Record<
  Campaign["status"],
  "default" | "secondary" | "outline" | "success" | "warning" | "danger"
> = {
  Draft: "secondary",
  Scheduled: "warning",
  Sending: "outline",
  Sent: "success",
  Cancelled: "danger",
};

const RECIPIENT_STATUS_VARIANT: Record<
  CampaignRecipient["status"],
  "default" | "secondary" | "outline" | "success" | "warning" | "danger"
> = {
  Queued: "outline",
  Sent: "secondary",
  Delivered: "secondary",
  Bounced: "danger",
  Opened: "default",
  Clicked: "success",
  Unsubscribed: "warning",
  Suppressed: "danger",
};

function formatWhen(value: string | null, timeZone: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      }).format(d);
}

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  const canManage = ctx.role === "owner" || ctx.role === "admin";

  const { id } = await params;
  const campaign = await getCampaign(ctx.org.id, id);
  if (!campaign) notFound();

  const recipients = await listCampaignRecipients(ctx.org.id, id);

  const statCards = [
    { label: "Recipients", value: campaign.recipientsCount },
    { label: "Delivered", value: campaign.deliveredCount },
    { label: "Bounced", value: campaign.bouncedCount },
    { label: "Opened", value: campaign.openedCount },
    { label: "Clicked", value: campaign.clickedCount },
    { label: "Unsubscribed", value: campaign.unsubscribedCount },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={campaign.name}
        description={`${campaign.subject} — ${CAMPAIGN_STATUS_LABELS[campaign.status]}`}
        actions={
          <>
            <Link
              href="/dashboard/campaigns"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ArrowLeft className="size-4" aria-hidden /> All campaigns
            </Link>
            {canManage && campaign.status === "Draft" ? (
              <Link
                href={`/dashboard/campaigns/${campaign.id}/edit`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Pencil className="size-3.5" aria-hidden /> Edit
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-2xl font-semibold">{s.value.toLocaleString("en-CA")}</span>
              <span className="text-sm text-muted-foreground">{s.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={CAMPAIGN_STATUS_VARIANT[campaign.status]}>
                    {CAMPAIGN_STATUS_LABELS[campaign.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Audience</dt>
                <dd>{describeAudience(campaign.audience)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sender</dt>
                <dd>
                  {campaign.senderName} &lt;{campaign.senderEmail}&gt;
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Scheduled for</dt>
                <dd>{formatWhen(campaign.scheduledFor, ctx.org.timezone)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sent</dt>
                <dd>{formatWhen(campaign.sentAt, ctx.org.timezone)}</dd>
              </div>
            </dl>
            {campaign.previewText ? (
              <p className="mt-4 text-sm italic text-muted-foreground">
                Preview: {campaign.previewText}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email body</CardTitle>
            <CardDescription>As authored — {"{{vars}}"} are filled per recipient.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs">
              {campaign.content}
            </pre>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CampaignPreview
          subject={campaign.subject}
          previewText={campaign.previewText ?? ""}
          content={campaign.content}
          imageUrl={campaign.imageUrl}
          sections={campaign.sections}
          bodyBackgroundColor={campaign.bodyBackgroundColor}
          senderName={campaign.senderName}
          senderEmail={campaign.senderEmail}
          footerBusinessName={ctx.org.name}
          footerAddress={[
            ctx.org.address,
            ctx.org.city,
            ctx.org.province,
            ctx.org.country,
            ctx.org.postalCode,
          ].filter((value): value is string => Boolean(value?.trim()))}
          footerAppUrl={appUrl}
        />
        <CampaignControls campaign={campaign} slug={ctx.org.slug} timeZone={ctx.org.timezone} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>
            {recipients.length} shown ({campaign.recipientsCount} total). Per-recipient delivery
            status updates automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recipients yet — send the campaign (or schedule it) to resolve the audience.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Contact</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Sent</th>
                    <th className="py-2 font-medium">Last event</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.contactName ?? "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{r.contactEmail ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={RECIPIENT_STATUS_VARIANT[r.status]}>
                          {RECIPIENT_STATUS_LABELS[r.status]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatWhen(r.sentAt, ctx.org.timezone)}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {formatWhen(
                          r.openedAt ??
                            r.clickedAt ??
                            r.bouncedAt ??
                            r.unsubscribedAt ??
                            r.deliveredAt,
                          ctx.org.timezone,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete this campaign and its recipient records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={deleteCampaignAction}>
              <input type="hidden" name="id" value={campaign.id} />
              <button
                type="submit"
                className={buttonVariants({ variant: "destructive", size: "sm" })}
              >
                Delete campaign
              </button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
