import Link from "next/link";
import { Megaphone, Pencil, Plus, FileText } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { listCampaignsPage, describeAudience } from "@/lib/campaigns/queries";
import { Pagination } from "@/components/dashboard/pagination";
import type { Campaign } from "@/lib/campaigns/types";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/constants";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_VARIANT: Record<
  Campaign["status"],
  "default" | "secondary" | "outline" | "success" | "warning" | "danger"
> = {
  Draft: "secondary",
  Scheduled: "warning",
  Sending: "outline",
  Sent: "success",
  Cancelled: "danger",
};

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const ctx = await getMyOrg();
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";

  const params = await searchParams;
  const page =
    Number.parseInt(
      Array.isArray(params.page) ? (params.page[0] ?? "") : (params.page ?? ""),
      10,
    ) || 1;
  const result = ctx ? await listCampaignsPage(ctx.org.id, page) : { campaigns: [], totalPages: 1 };
  const campaigns = result.campaigns;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Campaigns"
        description="Email campaigns to your contacts."
        actions={
          canManage ? (
            <>
              <Link href="/dashboard/templates" className={buttonVariants({ variant: "outline" })}>
                <FileText className="size-4" aria-hidden /> Templates
              </Link>
              <Link href="/dashboard/campaigns/new" className={buttonVariants({})}>
                <Plus className="size-4" aria-hidden /> New campaign
              </Link>
            </>
          ) : undefined
        }
      />

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Megaphone className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">No campaigns yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {canManage
                ? "Create your first campaign — pick an audience, draft the email and send it."
                : "An owner or administrator can create campaigns."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{campaign.name}</CardTitle>
                  <Badge variant={STATUS_VARIANT[campaign.status]}>
                    {CAMPAIGN_STATUS_LABELS[campaign.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="line-clamp-2 text-sm text-foreground">{campaign.subject}</p>
                <dl className="grid gap-1 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Audience</dt>
                    <dd>{describeAudience(campaign.audience)}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <dt className="text-muted-foreground">Recipients</dt>
                      <dd className="font-medium">{campaign.recipientsCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Opened</dt>
                      <dd className="font-medium">{campaign.openedCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Clicked</dt>
                      <dd className="font-medium">{campaign.clickedCount}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {campaign.status === "Scheduled" ? "Scheduled for" : "Sent"}
                    </dt>
                    <dd>
                      {formatWhen(
                        campaign.status === "Scheduled" ? campaign.scheduledFor : campaign.sentAt,
                      )}
                    </dd>
                  </div>
                </dl>
                <span className="mt-auto flex gap-2 pt-2">
                  <Link
                    href={`/dashboard/campaigns/${campaign.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    View
                  </Link>
                  {canManage && campaign.status === "Draft" ? (
                    <Link
                      href={`/dashboard/campaigns/${campaign.id}/edit`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Link>
                  ) : null}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Pagination
        page={page}
        totalPages={result.totalPages}
        href={(target) => `/dashboard/campaigns?page=${target}`}
      />
    </div>
  );
}
