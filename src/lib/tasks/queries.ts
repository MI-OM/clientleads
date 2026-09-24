import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Task, TaskStatus, TaskView } from "./types";
import { OPEN_TASK_STATUSES } from "./types";

/** Snake-case row as returned by PostgREST (tasks + embedded relations). */
interface TaskRow {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  contact_id: string | null;
  lead_id: string | null;
  appointment_id: string | null;
  assignee_id: string | null;
  created_by: string | null;
  due_date: string | null;
  priority: Task["priority"];
  status: TaskStatus;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    contactId: row.contact_id,
    leadId: row.lead_id,
    appointmentId: row.appointment_id,
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    notes: row.notes,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assigneeName: null,
    contactName: null,
  };
}

/** Attach assignee (profiles) + contact names to a list of tasks. */
async function attachNames(tasks: Task[]): Promise<Task[]> {
  if (tasks.length === 0) return tasks;
  const supabase = await createClient();

  const assigneeIds = [...new Set(tasks.map((t) => t.assigneeId).filter(Boolean))] as string[];
  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", assigneeIds);
    const names = new Map((profiles ?? []).map((p) => [String(p.id), String(p.full_name ?? "")]));
    for (const t of tasks) t.assigneeName = t.assigneeId ? (names.get(t.assigneeId) ?? null) : null;
  }

  const contactIds = [...new Set(tasks.map((t) => t.contactId).filter(Boolean))] as string[];
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .in("id", contactIds);
    const names = new Map(
      (contacts ?? []).map((c) => [
        String(c.id),
        `${String(c.first_name ?? "")} ${String(c.last_name ?? "")}`.trim() || "Unnamed contact",
      ]),
    );
    for (const t of tasks) t.contactName = t.contactId ? (names.get(t.contactId) ?? null) : null;
  }

  return tasks;
}

/** All org tasks, soonest-due first (open tasks first). */
export const listTasks = cache(
  async (orgId: string, opts: { view?: TaskView; userId?: string } = {}): Promise<Task[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tasks")
      .select(
        "id, organization_id, title, description, contact_id, lead_id, appointment_id, assignee_id, created_by, due_date, priority, status, notes, completed_at, created_at, updated_at",
      )
      .eq("organization_id", orgId)
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500);

    let tasks = (data ?? []).map((r) => mapTask(r as unknown as TaskRow));

    const now = new Date().toISOString();
    const view = opts.view ?? "mine";
    switch (view) {
      case "mine": {
        const me = opts.userId ?? "";
        tasks = tasks.filter((t) => t.assigneeId === me || t.createdBy === me);
        break;
      }
      case "open":
        tasks = tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status));
        break;
      case "overdue":
        tasks = tasks.filter(
          (t) => OPEN_TASK_STATUSES.includes(t.status) && t.dueDate !== null && t.dueDate < now,
        );
        break;
      case "due-soon":
        tasks = tasks
          .filter(
            (t) =>
              OPEN_TASK_STATUSES.includes(t.status) &&
              t.dueDate !== null &&
              t.dueDate >= now &&
              t.dueDate <= new Date(Date.now() + 7 * 86400_000).toISOString(),
          )
          .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
        break;
      default:
        break;
    }

    return attachNames(tasks);
  },
);

export const listTasksPage = cache(
  async (
    orgId: string,
    opts: { view?: TaskView; userId?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ tasks: Task[]; total: number; page: number; totalPages: number }> => {
    const supabase = await createClient();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = opts.pageSize ?? 25;
    const now = new Date();
    const nowIso = now.toISOString();
    const soonIso = new Date(now.getTime() + 7 * 86400_000).toISOString();
    const view = opts.view ?? "mine";

    let query = supabase
      .from("tasks")
      .select(
        "id, organization_id, title, description, contact_id, lead_id, appointment_id, assignee_id, created_by, due_date, priority, status, notes, completed_at, created_at, updated_at",
        { count: "exact" },
      )
      .eq("organization_id", orgId);

    if (view === "mine") {
      if (!opts.userId) return { tasks: [], total: 0, page, totalPages: 1 };
      query = query.or(`assignee_id.eq.${opts.userId},created_by.eq.${opts.userId}`);
    } else if (view === "open") {
      query = query.in("status", OPEN_TASK_STATUSES);
    } else if (view === "overdue") {
      query = query.in("status", OPEN_TASK_STATUSES).lt("due_date", nowIso);
    } else if (view === "due-soon") {
      query = query
        .in("status", OPEN_TASK_STATUSES)
        .gte("due_date", nowIso)
        .lte("due_date", soonIso);
    }

    const from = (page - 1) * pageSize;
    const { data, count } = await query
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1);
    const tasks = await attachNames((data ?? []).map((r) => mapTask(r as unknown as TaskRow)));
    const total = count ?? 0;
    return { tasks, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  },
);

export const getTask = cache(async (orgId: string, id: string): Promise<Task | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      "id, organization_id, title, description, contact_id, lead_id, appointment_id, assignee_id, created_by, due_date, priority, status, notes, completed_at, created_at, updated_at",
    )
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const [task] = await attachNames([mapTask(data as unknown as TaskRow)]);
  return task;
});

/** Pending (Open/In Progress) task count — analytics + dashboard widget. */
export async function countPendingTasks(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("status", OPEN_TASK_STATUSES);
  if (error) return 0;
  return count ?? 0;
}

/** Overdue (due before now, still open) task count — analytics. */
export async function countOverdueTasks(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("status", OPEN_TASK_STATUSES)
    .lt("due_date", new Date().toISOString());
  if (error) return 0;
  return count ?? 0;
}
