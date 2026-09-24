import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getMyOrg } from "@/lib/auth/org";
import { getTask } from "@/lib/tasks/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { TaskForm } from "../../task-form";
import { getTaskFormOptions } from "../../task-options";
import { canManageTask } from "../../actions";

interface EditTaskPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTaskPage({ params }: EditTaskPageProps) {
  const ctx = await getMyOrg();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const task = await getTask(ctx.org.id, id);
  if (!task) notFound();

  // Assignee or creator can edit their own tasks; owner/admin edit anything.
  const user = await getCurrentUser();
  if (!await canManageTask(task, user?.id, ctx)) redirect("/dashboard/tasks");

  const options = await getTaskFormOptions(ctx.org.id);

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <PageHeader title={`Edit: ${task.title}`} description="Update the task details." />
      <TaskForm
        task={task}
        members={options.members}
        contacts={options.contacts}
        leads={options.leads}
        appointments={options.appointments}
      />
    </div>
  );
}
