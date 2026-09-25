import { notFound, redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { getResource } from "@/lib/resources/queries";
import { ResourceForm } from "../../resource-form";
import { PageHeader } from "@/components/dashboard/page-header";

interface EditResourcePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditResourcePage({ params }: EditResourcePageProps) {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/resources");

  const { id } = await params;
  const resource = await getResource(ctx.org.id, id);
  if (!resource) notFound();

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <PageHeader title={`Edit: ${resource.title}`} description="Update the resource details." />
      <ResourceForm resource={resource} orgId={ctx.org.id} />
    </div>
  );
}
