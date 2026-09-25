import { redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { ServiceForm } from "../service-form";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function NewServicePage() {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/services");

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <PageHeader title="New service" description="Add something you offer to clients." />
      <ServiceForm />
    </div>
  );
}
