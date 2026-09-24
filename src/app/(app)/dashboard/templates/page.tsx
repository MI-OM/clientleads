import Link from "next/link";
import { FileText, Plus, Pencil } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { listEmailTemplatesPage } from "@/lib/campaigns/queries";
import { Pagination } from "@/components/dashboard/pagination";
import { deleteTemplateAction } from "./actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const ctx = await getMyOrg();
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";

  const params = await searchParams;
  const page = Number.parseInt(Array.isArray(params.page) ? params.page[0] ?? "" : params.page ?? "", 10) || 1;
  const result = ctx ? await listEmailTemplatesPage(ctx.org.id, page) : { templates: [], totalPages: 1 };
  const templates = result.templates;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Email templates"
        description="Reusable emails for campaigns (PRD §25)."
        actions={
          canManage ? (
            <>
              <Link href="/dashboard/campaigns" className={buttonVariants({ variant: "ghost" })}>
                ← Campaigns
              </Link>
              <Link href="/dashboard/templates/new" className={buttonVariants({})}>
                <Plus className="size-4" aria-hidden /> New template
              </Link>
            </>
          ) : undefined
        }
      />

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <FileText className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">No templates yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {canManage
                ? "Create reusable email templates to speed up campaign drafting."
                : "An owner or administrator can create templates."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col">
              {template.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={template.imageUrl}
                  alt=""
                  className="h-32 w-full rounded-t-lg object-cover"
                />
              ) : null}
              <CardHeader>
                <CardTitle className="text-base">{template.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="line-clamp-2 text-sm text-foreground">{template.subject}</p>
                <p className="line-clamp-3 text-sm text-muted-foreground">{template.body}</p>
                <p className="text-xs text-muted-foreground">
                  {template.variables.length > 0
                    ? `Variables: ${template.variables.join(", ")}`
                    : "No variables"}
                </p>
                {template.sections.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {template.sections.length} customizable design sections
                  </p>
                ) : null}
                {canManage ? (
                  <div className="mt-auto flex items-center gap-2 pt-2">
                    <Link
                      href={`/dashboard/templates/${template.id}/edit`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Link>
                    <form action={deleteTemplateAction}>
                      <input type="hidden" name="id" value={template.id} />
                      <button
                        type="submit"
                        className={
                          buttonVariants({ variant: "ghost", size: "sm" }) +
                          " text-destructive hover:text-destructive"
                        }
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={result.totalPages} href={(target) => `/dashboard/templates?page=${target}`} />
    </div>
  );
}
