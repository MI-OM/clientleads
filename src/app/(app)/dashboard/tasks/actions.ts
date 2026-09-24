"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getMyOrg } from "@/lib/auth/org";
import { getTask } from "@/lib/tasks/queries";
import type { Task, TaskPriority, TaskStatus } from "@/lib/tasks/types";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/tasks/types";
import { sendNotificationEmail } from "@/lib/email/notify";

export interface TaskActionState {
  error?: string;
  ok?: boolean;
}

function isAdmin(ctx: Awaited<ReturnType<typeof getMyOrg>>): boolean {
  return !!ctx && (ctx.role === "owner" || ctx.role === "admin");
}

/** Staff can manage their own tasks; owner/admin manage everything. */
export async function canManageTask(
  task: Pick<Task, "assigneeId" | "createdBy">,
  userId: string | undefined,
  ctx: Awaited<ReturnType<typeof getMyOrg>>,
): Promise<boolean> {
  return isAdmin(ctx) || task.assigneeId === userId || task.createdBy === userId;
}

interface ParsedTaskInput {
  title: string;
  description: string | null;
  contactId: string | null;
  leadId: string | null;
  appointmentId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  notes: string | null;
}

async function parseTaskInput(formData: FormData): Promise<ParsedTaskInput | { error: string }> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Task title is required." };
  if (title.length > 300) return { error: "Keep the title under 300 characters." };

  const priority = String(formData.get("priority") ?? "Normal") as TaskPriority;
  if (!TASK_PRIORITIES.includes(priority)) return { error: "Choose a valid priority." };

  const status = String(formData.get("status") ?? "Open") as TaskStatus;
  if (!TASK_STATUSES.includes(status)) return { error: "Choose a valid status." };

  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  let dueDate: string | null = null;
  if (dueRaw) {
    const due = new Date(dueRaw);
    if (Number.isNaN(due.getTime())) return { error: "That due date doesn't look valid." };
    dueDate = due.toISOString();
  }

  return {
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    contactId: String(formData.get("contactId") ?? "").trim() || null,
    leadId: String(formData.get("leadId") ?? "").trim() || null,
    appointmentId: String(formData.get("appointmentId") ?? "").trim() || null,
    assigneeId: String(formData.get("assigneeId") ?? "").trim() || null,
    dueDate,
    priority,
    status,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

/** Best-effort: email the person a task lands on (PRD §34, task assigned). */
async function notifyAssignee(
  ctx: NonNullable<Awaited<ReturnType<typeof getMyOrg>>>,
  currentUserId: string | undefined,
  input: { assigneeId: string | null; title: string; dueDate: string | null },
) {
  if (!input.assigneeId || input.assigneeId === currentUserId) return;
  try {
    const supabase = await createClient();
    const { data: email } = await supabase.rpc("get_user_email", {
      p_user_id: input.assigneeId,
    });
    if (!email) return;
    await sendNotificationEmail({
      kind: "task_assigned",
      to: email as string,
      orgName: ctx.org.name,
      taskTitle: input.title,
      dueDate: input.dueDate,
    });
  } catch {
    // Email is best-effort — never break the task mutation.
  }
}

/** Create a task (PRD §24) — any org member; org scoping via RLS. */
export async function createTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };

  const parsed = await parseTaskInput(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      organization_id: ctx.org.id,
      title: parsed.title,
      description: parsed.description,
      contact_id: parsed.contactId,
      lead_id: parsed.leadId,
      appointment_id: parsed.appointmentId,
      assignee_id: parsed.assigneeId,
      created_by: user?.id ?? null,
      due_date: parsed.dueDate,
      priority: parsed.priority,
      status: parsed.status,
      notes: parsed.notes,
      completed_at: parsed.status === "Completed" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  const taskId = data?.id as string | undefined;

  try {
    await supabase.rpc("log_activity", {
      p_organization_id: ctx.org.id,
      p_lead_id: parsed.leadId,
      p_contact_id: parsed.contactId,
      p_activity_type: "task_created",
      p_subject: "Task created",
      p_description: parsed.title,
      p_metadata: { task_id: taskId },
    });
  } catch {
    // activity logging is best-effort
  }

  await notifyAssignee(ctx, user?.id, {
    assigneeId: parsed.assigneeId,
    title: parsed.title,
    dueDate: parsed.dueDate,
  });

  revalidatePath("/dashboard/tasks");
  return { ok: true };
}

/** Update a task — assignee/creator or owner/admin. */
export async function updateTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const ctx = await getMyOrg();
  if (!ctx) return { error: "No workspace was found for your account." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing task id." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const current = await getTask(ctx.org.id, id);
  if (!current) return { error: "Task not found." };
  if (!await canManageTask(current, user?.id, ctx)) {
    return { error: "You can only manage tasks assigned to you (or created by you)." };
  }

  const parsed = await parseTaskInput(formData);
  if ("error" in parsed) return parsed;

  const before = {
    title: current.title,
    status: current.status,
    priority: current.priority,
    due_date: current.dueDate,
    assignee_id: current.assigneeId,
    contact_id: current.contactId,
    lead_id: current.leadId,
    appointment_id: current.appointmentId,
  };

  const { error } = await supabase
    .from("tasks")
    .update({
      title: parsed.title,
      description: parsed.description,
      contact_id: parsed.contactId,
      lead_id: parsed.leadId,
      appointment_id: parsed.appointmentId,
      assignee_id: parsed.assigneeId,
      due_date: parsed.dueDate,
      priority: parsed.priority,
      status: parsed.status,
      notes: parsed.notes,
      completed_at:
        parsed.status === "Completed" ? (current.completedAt ?? new Date().toISOString()) : null,
    })
    .eq("id", id)
    .eq("organization_id", ctx.org.id);

  if (error) return { error: error.message };

  const after = {
    title: parsed.title,
    status: parsed.status,
    priority: parsed.priority,
    due_date: parsed.dueDate,
    assignee_id: parsed.assigneeId,
    contact_id: parsed.contactId,
    lead_id: parsed.leadId,
    appointment_id: parsed.appointmentId,
  };

  try {
    if (user?.id) {
      await supabase.rpc("log_audit", {
        p_organization_id: ctx.org.id,
        p_user_id: user.id,
        p_action: "task.updated",
        p_entity_type: "task",
        p_entity_id: id,
        p_before: before as never,
        p_after: after as never,
      });
    }
    await supabase.rpc("log_activity", {
      p_organization_id: ctx.org.id,
      p_lead_id: parsed.leadId,
      p_contact_id: parsed.contactId,
      p_activity_type: "task_updated",
      p_subject: "Task updated",
      p_description: parsed.title,
      p_metadata: { task_id: id },
    });
  } catch {
    // best-effort
  }

  if (current.assigneeId !== parsed.assigneeId) {
    await notifyAssignee(ctx, user?.id, {
      assigneeId: parsed.assigneeId,
      title: parsed.title,
      dueDate: parsed.dueDate,
    });
  }

  revalidatePath("/dashboard/tasks");
  revalidatePath(`/dashboard/tasks/${id}/edit`);
  return { ok: true };
}

/** Inline status change (e.g. "Complete" from the list) — assignee/creator
 *  or owner/admin; audits + logs the change. */
export async function setTaskStatusAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx) return;

  const id = String(formData.get("id") ?? "").trim();
  const next = String(formData.get("status") ?? "") as TaskStatus;
  if (!id || !TASK_STATUSES.includes(next)) return;

  const supabase = await createClient();
  const user = await getCurrentUser();
  const current = await getTask(ctx.org.id, id);
  if (!current) return;
  if (!await canManageTask(current, user?.id, ctx)) return;

  const { error } = await supabase
    .from("tasks")
    .update({
      status: next,
      completed_at: next === "Completed" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("organization_id", ctx.org.id);
  if (error) return;

  try {
    if (user?.id) {
      await supabase.rpc("log_audit", {
        p_organization_id: ctx.org.id,
        p_user_id: user.id,
        p_action: "task.status_changed",
        p_entity_type: "task",
        p_entity_id: id,
        p_before: { status: current.status } as never,
        p_after: { status: next } as never,
      });
    }
    await supabase.rpc("log_activity", {
      p_organization_id: ctx.org.id,
      p_lead_id: current.leadId,
      p_contact_id: current.contactId,
      p_activity_type: "task_status_changed",
      p_subject: "Task status changed",
      p_description: `${current.title} → ${next}`,
      p_metadata: { task_id: id, to_status: next },
    });
  } catch {
    // best-effort
  }

  revalidatePath("/dashboard/tasks");
}

/** Delete a task — assignee/creator or owner/admin. */
export async function deleteTaskAction(formData: FormData): Promise<void> {
  const ctx = await getMyOrg();
  if (!ctx) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  const user = await getCurrentUser();
  const current = await getTask(ctx.org.id, id);
  if (!current) return;
  if (!await canManageTask(current, user?.id, ctx)) return;

  await supabase.from("tasks").delete().eq("id", id).eq("organization_id", ctx.org.id);

  try {
    if (user?.id) {
      await supabase.rpc("log_audit", {
        p_organization_id: ctx.org.id,
        p_user_id: user.id,
        p_action: "task.deleted",
        p_entity_type: "task",
        p_entity_id: id,
        p_before: { title: current.title, status: current.status } as never,
        p_after: null,
      });
    }
    await supabase.rpc("log_activity", {
      p_organization_id: ctx.org.id,
      p_lead_id: current.leadId,
      p_contact_id: current.contactId,
      p_activity_type: "task_deleted",
      p_subject: "Task deleted",
      p_description: current.title,
    });
  } catch {
    // best-effort
  }

  revalidatePath("/dashboard/tasks");
}
