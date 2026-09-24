import { notFound, redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { getEmailTemplate } from "@/lib/campaigns/queries";
import { TemplateForm } from "../../template-form";
import { PageHeader } from "@/components/dashboard/page-header";

interface EditTemplatePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: EditTemplatePageProps) {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/templates");

  const { id } = await params;
  const template = await getEmailTemplate(ctx.org.id, id);
  if (!template) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={`Edit: ${template.name}`}
        description="Update this reusable email template."
      />
      <TemplateForm template={template} />
    </div>
  );
}
