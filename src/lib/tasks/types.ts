/** M6 tasks domain types (PRD §24). */

export type TaskStatus = "Open" | "In Progress" | "Completed" | "Cancelled";

export type TaskPriority = "Low" | "Normal" | "High" | "Urgent";

export const TASK_STATUSES: TaskStatus[] = ["Open", "In Progress", "Completed", "Cancelled"];

export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Normal", "High", "Urgent"];

export const OPEN_TASK_STATUSES: TaskStatus[] = ["Open", "In Progress"];

/** Task list view filters offered on the tasks page. */
export type TaskView = "mine" | "open" | "overdue" | "due-soon" | "all";

export const TASK_VIEWS: TaskView[] = ["mine", "open", "overdue", "due-soon", "all"];

export interface Task {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  contactId: string | null;
  leadId: string | null;
  appointmentId: string | null;
  assigneeId: string | null;
  createdBy: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Joined display fields (resolved in queries). */
  assigneeName: string | null;
  contactName: string | null;
}
