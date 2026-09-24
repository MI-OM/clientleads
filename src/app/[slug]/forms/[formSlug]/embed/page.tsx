import { notFound } from "next/navigation";
import { getPublicPageData } from "@/lib/public/page-data";
import { LeadForm } from "../../../lead-form";

export default async function EmbeddedFormPage({
  params,
}: {
  params: Promise<{ slug: string; formSlug: string }>;
}) {
  const { slug, formSlug } = await params;
  const page = await getPublicPageData(slug);
  const form = page?.forms.find((item) => item.slug === formSlug);
  if (!page || !form) notFound();

  return (
    <main
      className="min-h-screen p-4"
      style={{
        backgroundColor: page.org.secondary_color,
        ["--brand" as string]: page.org.primary_color,
      }}
    >
      <LeadForm form={form} pageSlug={page.org.slug} />
    </main>
  );
}
