"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { Task, TaskPriority, TaskStatus } from "@/lib/tasks/types";
import type { TaskActionState } from "./actions";
import { bulkDeleteTasksAction, deleteTaskAction, setTaskStatusAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

const initialState: TaskActionState = {};
const statusVariant: Record<TaskStatus, "default" | "secondary" | "outline" | "success"> = {
  Open: "secondary",
  "In Progress": "default",
  Completed: "success",
  Cancelled: "outline",
};
const priorityVariant: Record<
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
    return "Invalid date";
  }
}

export function TasksTable({
  tasks,
  timezone,
  canManageAny,
  userId,
}: {
  tasks: Task[];
  timezone: string;
  canManageAny: boolean;
  userId?: string;
}) {
  const [state, formAction, pending] = useActionState(bulkDeleteTasksAction, initialState);
  const [selected, setSelected] = useState<string[]>([]);
  const allSelected = tasks.length > 0 && selected.length === tasks.length;
  const canManage = (task: Task) =>
    canManageAny || task.assigneeId === userId || task.createdBy === userId;
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <div>
      <form
        id="bulk-task-form"
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              `Delete ${selected.length} selected task${selected.length === 1 ? "" : "s"}?`,
            )
          )
            event.preventDefault();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? [] : tasks.map((task) => task.id))}
              aria-label="Select all tasks on this page"
            />
            Select all on page
          </label>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{selected.length} selected</span>
            <button
              type="submit"
              disabled={selected.length === 0 || pending}
              className="inline-flex h-9 items-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground disabled:opacity-50"
            >
              Delete selected
            </button>
          </div>
        </div>
        {state.error ? (
          <p role="alert" className="border-b px-4 py-3 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p role="status" className="border-b px-4 py-3 text-sm text-green-700">
            Selected tasks deleted.
          </p>
        ) : null}
      </form>
      <ul className="divide-y divide-border px-4">
        {tasks.map((task) => {
          const open = task.status === "Open" || task.status === "In Progress";
          return (
            <li key={task.id} className="flex flex-wrap items-center gap-3 py-3">
              <input
                type="checkbox"
                form="bulk-task-form"
                name="taskId"
                value={task.id}
                checked={selected.includes(task.id)}
                onChange={() => toggle(task.id)}
                disabled={!canManage(task)}
                aria-label={`Select ${task.title}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{task.title}</p>
                  <Badge variant={statusVariant[task.status]}>{task.status}</Badge>
                  <Badge variant={priorityVariant[task.priority]}>{task.priority}</Badge>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {task.assigneeName ? `Assigned to ${task.assigneeName} · ` : ""}
                  {formatDue(task.dueDate, timezone)}
                  {task.contactName ? ` · ${task.contactName}` : ""}
                </p>
              </div>
              {canManage(task) ? (
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
        })}
      </ul>
    </div>
  );
}
