import {
  Activity as ActivityIcon,
  Archive,
  ArrowLeftRight,
  Pencil,
  RotateCcw,
  StickyNote,
  Tag,
  Target,
  Trash2,
  UserPlus,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { Activity } from "@/lib/crm/types";
import { activityMeta } from "@/lib/crm/constants";
import { formatRelative, initials } from "@/lib/crm/format";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, LucideIcon> = {
  contact_created: UserPlus,
  contact_updated: Pencil,
  contact_deleted: UserX,
  contact_archived: Archive,
  contact_restored: RotateCcw,
  tag_added: Tag,
  tag_removed: Tag,
  lead_created: Target,
  lead_updated: Pencil,
  lead_stage_changed: ArrowLeftRight,
  lead_deleted: Trash2,
  note_added: StickyNote,
};

const TYPE_TONES: Record<string, string> = {
  lead_stage_changed: "text-blue-600 bg-blue-50",
  note_added: "text-amber-700 bg-amber-50",
  contact_deleted: "text-red-600 bg-red-50",
  lead_deleted: "text-red-600 bg-red-50",
  tag_added: "text-primary bg-primary/10",
  tag_removed: "text-muted-foreground bg-muted",
};

export function ActivityTimeline({
  activities,
  emptyTitle = "No activity yet",
  emptyDescription = "Timeline entries appear automatically as contacts and leads change, and when notes are added.",
}: {
  activities: Activity[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-md border border-dashed p-8 text-center">
        <ActivityIcon className="size-6 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm font-medium">{emptyTitle}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <ol className="space-y-0">
      {activities.map((activity, index) => {
        const Icon = TYPE_ICONS[activity.activityType] ?? ActivityIcon;
        const meta = activityMeta(activity.activityType);
        return (
          <li key={activity.id} className="relative flex gap-3 pb-5 last:pb-0">
            {index < activities.length - 1 ? (
              <span className="absolute left-[15px] top-8 h-full w-px bg-border" aria-hidden />
            ) : null}
            <span
              className={cn(
                "z-10 grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card",
                TYPE_TONES[activity.activityType],
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-medium">{activity.subject ?? meta.label}</p>
                <time className="text-xs text-muted-foreground" dateTime={activity.createdAt}>
                  {formatRelative(activity.createdAt)}
                </time>
              </div>
              {activity.description ? (
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                  {activity.description}
                </p>
              ) : null}
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="grid size-4 place-items-center rounded-full bg-secondary text-[9px] font-semibold">
                  {initials(activity.userName)}
                </span>
                <span>{activity.userName || "System"}</span>
                {activity.contactId ? (
                  <>
                    <span aria-hidden>·</span>
                    <a
                      href={`/dashboard/contacts/${activity.contactId}`}
                      className="hover:text-primary hover:underline"
                    >
                      Contact
                    </a>
                  </>
                ) : null}
                {activity.leadId ? (
                  <>
                    <span aria-hidden>·</span>
                    <a
                      href={`/dashboard/leads/${activity.leadId}`}
                      className="hover:text-primary hover:underline"
                    >
                      Lead
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
