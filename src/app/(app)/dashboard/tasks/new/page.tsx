import { redirect } from "next/navigation";
import { getMyOrg } from "@/lib/auth/org";
import { PageHeader } from "@/components/dashboard/page-header";
import { TaskForm } from "../task-form";
import { getTaskFormOptions } from "../task-options";

export default async function NewTaskPage() {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");

  const options = await getTaskFormOptions(ctx.org.id);

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <PageHeader title="New task" description="Capture a follow-up or to-do." />
      <TaskForm
        members={options.members}
        contacts={options.contacts}
        leads={options.leads}
        appointments={options.appointments}
      />
    </div>
  );
}
