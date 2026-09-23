import { redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { ResourceForm } from "../resource-form";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function NewResourcePage() {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/resources");

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <PageHeader title="New resource" description="Upload a file to share with visitors." />
      <ResourceForm orgId={ctx.org.id} />
    </div>
  );
}