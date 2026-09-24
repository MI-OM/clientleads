import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { listForms } from "@/lib/forms/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function FormsPage() {
  const ctx = await getMyOrg();
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";
  const forms = ctx ? await listForms(ctx.org.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Forms"
        description="Lead-capture forms shown on your public page."
        actions={
          canManage ? (
            <Link href="/dashboard/forms/new" className={buttonVariants({})}>
              <Plus className="size-4" aria-hidden /> New form
            </Link>
          ) : undefined
        }
      />

      {forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="font-medium">No forms yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A form lets visitors send you inquiries — each submission becomes a contact and a lead
              in your CRM.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => (
            <Card key={form.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{form.name}</CardTitle>
                  {!form.active ? <Badge variant="warning">Inactive</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="font-mono text-xs text-muted-foreground">/{form.slug}</p>
                {form.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{form.description}</p>
                ) : null}
                <dl className="text-sm">
                  <dt className="inline text-muted-foreground">Fields: </dt>
                  <dd className="inline">
                    {form.fields.length} · source “{form.source}”
                  </dd>
                </dl>
                {canManage ? (
                  <Link
                    href={`/dashboard/forms/${form.id}`}
                    className={
                      buttonVariants({ variant: "outline", size: "sm" }) + " mt-auto self-start"
                    }
                  >
                    <Pencil className="size-3.5" aria-hidden /> Edit fields
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
