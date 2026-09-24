import Link from "next/link";
import { CalendarClock, ClipboardPlus, ListTodo } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, getMyOrg } from "@/lib/auth/org";
import { listTasksPage } from "@/lib/tasks/queries";
import { Pagination } from "@/components/dashboard/pagination";
import type { TaskView } from "@/lib/tasks/types";
import { TASK_VIEWS } from "@/lib/tasks/types";
import { TasksTable } from "./tasks-table";

interface SearchParams {
  view?: string | string[];
  page?: string | string[];
}

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const VIEW_LABELS: Record<TaskView, string> = {
  mine: "My tasks",
  open: "Open",
  overdue: "Overdue",
  "due-soon": "Due soon",
  all: "All",
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getMyOrg();
  const params = await searchParams;
  const view = (TASK_VIEWS as string[]).includes(stringParam(params.view))
    ? (stringParam(params.view) as TaskView)
    : "open";
  const user = await getCurrentUser();
  const page = Number.parseInt(stringParam(params.page), 10) || 1;

  const result = ctx
    ? await listTasksPage(ctx.org.id, { view, userId: user?.id, page })
    : { tasks: [], total: 0, page, totalPages: 1 };
  const canManageAny = ctx ? ctx.role === "owner" || ctx.role === "admin" : false;

  if (!ctx) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No workspace found</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tasks"
        description="Follow-ups, to-dos and assignments for your team."
        actions={
          <Link href="/dashboard/tasks/new" className={buttonVariants({ variant: "default" })}>
            <ClipboardPlus className="size-4" aria-hidden /> New task
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {TASK_VIEWS.map((v) => (
          <Link
            key={v}
            href={`/dashboard/tasks?view=${v}`}
            className={
              v === view
                ? buttonVariants({ variant: "default", size: "sm" })
                : buttonVariants({ variant: "outline", size: "sm" })
            }
          >
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{VIEW_LABELS[view]}</CardTitle>
        </CardHeader>
        <CardContent>
          {result.tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <ListTodo className="size-8 text-muted-foreground/50" aria-hidden />
              <p className="font-medium">No tasks here</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Create a task, or wait for an automation to generate a follow-up.
              </p>
            </div>
          ) : <TasksTable tasks={result.tasks} timezone={ctx.org.timezone} canManageAny={canManageAny} userId={user?.id} />}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        totalPages={result.totalPages}
        href={(target) => `/dashboard/tasks?view=${view}&page=${target}`}
      />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" aria-hidden />
        Overdue counts tasks still open past their due date; Due soon = next 7 days.
      </p>
    </div>
  );
}
