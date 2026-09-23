import { notFound, redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { getForm } from "@/lib/forms/queries";
import { FormBuilder } from "../form-builder";
import { PageHeader } from "@/components/dashboard/page-header";

interface EditFormPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditFormPage({ params }: EditFormPageProps) {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard/forms");

  const { id } = await params;
  const form = await getForm(ctx.org.id, id);
  if (!form) notFound();

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-6">
      <PageHeader title={`Edit: ${form.name}`} description="Change the form's fields and settings." />
      <FormBuilder form={form} />
    </div>
  );
}