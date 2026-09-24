import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { listServices } from "@/lib/services/queries";
import { formatDuration, formatPrice, locationLabel } from "@/lib/public/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ServicesPage() {
  const ctx = await getMyOrg();
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";

  const services = ctx ? await listServices(ctx.org.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Services"
        description="What you offer, shown on your public page."
        actions={
          canManage ? (
            <Link href="/dashboard/services/new" className={buttonVariants({})}>
              <Plus className="size-4" aria-hidden /> New service
            </Link>
          ) : undefined
        }
      />

      {services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="font-medium">No services yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {canManage
                ? "Add your first service — it will appear on your public business page."
                : "An owner or administrator can add services."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <Card key={service.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{service.name}</CardTitle>
                  {!service.active ? (
                    <Badge variant="warning">Inactive</Badge>
                  ) : service.bookingEnabled ? (
                    <Badge>Bookable</Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                {service.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {service.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd>{formatDuration(service.durationMin)}</dd>
                  <dt className="text-muted-foreground">Price</dt>
                  <dd>{formatPrice(service.price, service.currency) ?? "Call for pricing"}</dd>
                  <dt className="text-muted-foreground">Location</dt>
                  <dd>{locationLabel(service.locationType)}</dd>
                </dl>
                {canManage ? (
                  <Link
                    href={`/dashboard/services/${service.id}/edit`}
                    className={
                      buttonVariants({ variant: "outline", size: "sm" }) + " mt-auto self-start"
                    }
                  >
                    <Pencil className="size-3.5" aria-hidden /> Edit
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
