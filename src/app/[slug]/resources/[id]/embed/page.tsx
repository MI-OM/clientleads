import { notFound } from "next/navigation";
import { getPublicPageData } from "@/lib/public/page-data";
import { ResourceDownload } from "../../../resource-gate";

export default async function EmbeddedResourcePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const page = await getPublicPageData(slug);
  const resource = page?.resources.find((item) => item.id === id);
  if (!page || !resource) notFound();

  return (
    <main
      className="min-h-screen p-4"
      style={{
        backgroundColor: page.org.secondary_color,
        ["--brand" as string]: page.org.primary_color,
      }}
    >
      <article className="mx-auto max-w-xl rounded-lg border border-border bg-card p-5 shadow-sm">
        <h1 className="text-lg font-semibold">{resource.title}</h1>
        {resource.description ? <p className="mt-2 text-sm text-muted-foreground">{resource.description}</p> : null}
        <div className="mt-4 border-t border-border pt-4">
          <ResourceDownload resource={resource} pageSlug={page.org.slug} />
        </div>
      </article>
    </main>
  );
}
