import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardPlus, ListTodo } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, getMyOrg } from "@/lib/auth/org";
import { listTasks } from "@/lib/tasks/queries";
import type { Task, TaskPriority, TaskStatus, TaskView } from "@/lib/tasks/types";
import { TASK_VIEWS } from "@/lib/tasks/types";
import { deleteTaskAction, setTaskStatusAction } from "./actions";

interface SearchParams {
  view?: string | string[];
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

const STATUS_VARIANT: Record<TaskStatus, "default" | "secondary" | "outline" | "success"> = {
  Open: "secondary",
  "In Progress": "default",
  Completed: "success",
  Cancelled: "outline",
};

const PRIORITY_VARIANT: Record<
  TaskPriority,
  "default" | "secondary" | "outline" | "warning" | "danger"
> = {
  Low: "outline",
  Normal: "secondary",
  High: "warning",
  Urgent: "danger",
};

function formatDue(iso: string | null, timezone: string): string {
  if (!iso) return "No due date";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

function TaskRow({
  task,
  canManage,
  timezone,
}: {
  task: Task;
  canManage: boolean;
  timezone: string;
}) {
  const open = task.status === "Open" || task.status === "In Progress";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{task.title}</p>
          <Badge variant={STATUS_VARIANT[task.status]}>{task.status}</Badge>
          <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {task.assigneeName ? `Assigned to ${task.assigneeName} · ` : ""}
          {formatDue(task.dueDate, timezone)}
          {task.contactName ? ` · ${task.contactName}` : ""}
        </p>
      </div>
      {canManage ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {open ? (
            <form action={setTaskStatusAction}>
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="status" value="Completed" />
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-medium shadow-sm hover:bg-accent"
              >
                <CheckCircle2 className="size-4" aria-hidden /> Complete
              </button>
            </form>
          ) : null}
          <Link
            href={`/dashboard/tasks/${task.id}/edit`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Edit
          </Link>
          <form action={deleteTaskAction}>
            <input type="hidden" name="id" value={task.id} />
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md border border-input bg-card px-3 text-sm font-medium text-destructive shadow-sm hover:bg-accent"
            >
              Delete
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getMyOrg();
  const params = await searchParams;
  const view = (TASK_VIEWS as string[]).includes(stringParam(params.view))
    ? (stringParam(params.view) as TaskView)
    : "open";
  const user = await getCurrentUser();

  const tasks = ctx ? await listTasks(ctx.org.id, { view, userId: user?.id }) : [];
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
        description="Follow-ups, to-dos and assignments for your team (PRD §24)."
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
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <ListTodo className="size-8 text-muted-foreground/50" aria-hidden />
              <p className="font-medium">No tasks here</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Create a task, or wait for an automation to generate a follow-up.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  canManage={
                    canManageAny || task.assigneeId === user?.id || task.createdBy === user?.id
                  }
                  timezone={ctx.org.timezone}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" aria-hidden />
        Overdue counts tasks still open past their due date; Due soon = next 7 days.
      </p>
    </div>
  );
}
