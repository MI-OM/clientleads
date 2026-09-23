import { notFound, redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { getService } from "@/lib/services/queries";
import { ServiceForm } from "../../service-form";
import { PageHeader } from "@/components/dashboard/page-header";

interface EditServicePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditServicePage({ params }: EditServicePageProps) {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/services");

  const { id } = await params;
  const service = await getService(ctx.org.id, id);
  if (!service) notFound();

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <PageHeader
        title={`Edit: ${service.name}`}
        description="Update the service details shown on your public page."
      />
      <ServiceForm service={service} />
    </div>
  );
}