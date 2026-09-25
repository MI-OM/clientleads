import { redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { FormBuilder } from "../form-builder";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function NewFormPage() {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/forms");

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-6">
      <PageHeader title="New form" description="Build a lead-capture form for your public page." />
      <FormBuilder />
    </div>
  );
}
