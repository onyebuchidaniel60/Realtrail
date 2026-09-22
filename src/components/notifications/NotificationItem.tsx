import type { Id } from "../../../convex/_generated/dataModel";
import { formatRelativeTime } from "@/components/cases/caseDisplay";
import { cn } from "@/lib/utils";

export type NotificationRow = {
  _id: Id<"notifications">;
  type:
    | "vendor_followup"
    | "resident_confirmation"
    | "urgent_case"
    | "system_error";
  title: string;
  body: string;
  caseId?: Id<"cases">;
  readAt?: number;
  createdAt: number;
};

export function NotificationItem({
  notification,
  onSelect,
}: {
  notification: NotificationRow;
  onSelect: () => void;
}) {
  const unread = notification.readAt === undefined;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left hover:bg-accent/50"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {unread && (
            <span
              aria-label="Unread"
              className="size-2 shrink-0 rounded-full bg-primary"
            />
          )}
          <span className={cn(!unread && "text-muted-foreground")}>
            {notification.title}
          </span>
        </span>
        <span className="text-sm text-muted-foreground">
          {notification.body}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt)}
        </span>
      </button>
    </li>
  );
}
