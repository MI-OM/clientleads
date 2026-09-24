"use client";

import { useActionState } from "react";
import { createTaskAction, updateTaskAction } from "./actions";
import type { TaskActionState } from "./actions";
import type { Task } from "@/lib/tasks/types";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/tasks/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface TaskFormOption {
  id: string;
  label: string;
}

interface TaskFormProps {
  task?: Task;
  members: TaskFormOption[];
  contacts: TaskFormOption[];
  leads: TaskFormOption[];
  appointments: TaskFormOption[];
}

/** ISO timestamp → value for an <input type="datetime-local"> (local tz). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function FormStatus({ state }: { state: TaskActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

export function TaskForm({ task, members, contacts, leads, appointments }: TaskFormProps) {
  const [state, formAction, pending] = useActionState<TaskActionState, FormData>(
    task ? updateTaskAction : createTaskAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>Task</CardTitle>
          <CardDescription>
            What needs doing, who it&apos;s for, and when it&apos;s due.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                defaultValue={task?.title ?? ""}
                placeholder="e.g. Follow up with John Smith"
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={task?.description ?? ""}
                placeholder="What's involved?"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assigneeId">Assigned to</Label>
              <Select id="assigneeId" name="assigneeId" defaultValue={task?.assigneeId ?? ""}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dueDate">Due date</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="datetime-local"
                defaultValue={toLocalInput(task?.dueDate)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" name="priority" defaultValue={task?.priority ?? "Normal"}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={task?.status ?? "Open"}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
          <CardDescription>Optional — connect this task to related records.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="contactId">Contact</Label>
              <Select id="contactId" name="contactId" defaultValue={task?.contactId ?? ""}>
                <option value="">None</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="leadId">Lead</Label>
              <Select id="leadId" name="leadId" defaultValue={task?.leadId ?? ""}>
                <option value="">None</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="appointmentId">Appointment</Label>
              <Select
                id="appointmentId"
                name="appointmentId"
                defaultValue={task?.appointmentId ?? ""}
              >
                <option value="">None</option>
                {appointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={task?.notes ?? ""}
              placeholder="Any extra context…"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <FormStatus state={state} />
      <div>
        <Button type="submit" loading={pending}>
          {task ? "Save changes" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
