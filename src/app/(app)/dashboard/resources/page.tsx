import Link from "next/link";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { listResourcesPage } from "@/lib/resources/queries";
import { Pagination } from "@/components/dashboard/pagination";
import { deleteResourceAction } from "./actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ResourcesPage({
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
  const result = ctx ? await listResourcesPage(ctx.org.id, page) : { resources: [], totalPages: 1 };
  const resources = result.resources;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Resources"
        description="Files visitors can download from your public page."
        actions={
          canManage ? (
            <Link href="/dashboard/resources/new" className={buttonVariants({})}>
              <Plus className="size-4" aria-hidden /> New resource
            </Link>
          ) : undefined
        }
      />

      {resources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="font-medium">No resources yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Upload guides, checklists, or brochures. Public resources appear on your business
              page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Downloads</th>
                  <th className="px-4 py-3 font-medium">Gated</th>
                  <th className="px-4 py-3 font-medium">Embed</th>
                  {canManage ? <th className="px-4 py-3 font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {resources.map((resource) => (
                  <tr key={resource.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{resource.title}</p>
                      {resource.description ? (
                        <p className="line-clamp-1 max-w-72 text-xs text-muted-foreground">
                          {resource.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <FileText className="size-3.5" aria-hidden />
                        {resource.fileName} ({formatSize(resource.fileSize)})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={resource.published ? "secondary" : "warning"}>
                        {resource.published ? "Published" : "Unpublished"}
                      </Badge>
                      {resource.visibility === "private" ? (
                        <Badge variant="outline" className="ml-1">
                          Private
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {resource.downloadCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {resource.gated ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">
                      {resource.published && resource.visibility === "public" ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-primary">Embed</summary>
                          <code className="mt-2 block max-w-xs overflow-x-auto rounded bg-muted p-2">{`<iframe src="${appUrl}/${ctx?.org.slug ?? ""}/resources/${resource.id}/embed" title="${resource.title}" style="width:100%;min-height:220px;border:0"></iframe>`}</code>
                        </details>
                      ) : null}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/resources/${resource.id}/edit`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            <Pencil className="size-3.5" aria-hidden /> Edit
                          </Link>
                          <form action={deleteResourceAction}>
                            <input type="hidden" name="id" value={resource.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                            >
                              <Trash2 className="size-3.5" aria-hidden /> Delete
                            </Button>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pagination
        page={page}
        totalPages={result.totalPages}
        href={(target) => `/dashboard/resources?page=${target}`}
      />
    </div>
  );
}
