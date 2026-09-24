import { redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { TemplateForm } from "../template-form";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function NewTemplatePage() {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/templates");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="New template" description="A reusable email you can base campaigns on." />
      <TemplateForm />
    </div>
  );
}
