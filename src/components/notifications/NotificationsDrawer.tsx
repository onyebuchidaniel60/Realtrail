import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { toast } from "@/components/common/toast";
import { errorMessage } from "@/components/cases/dialogs/dialogUtils";
import { NotificationItem } from "./NotificationItem";

const PAGE_LIMIT = 20;

// Drawer-only surface by design (no /notifications route in MVP).
// Reads are live; the badge in the sidebar reads the same unreadCount.
export function NotificationsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const list = useQuery(
    api.notifications.queries.list,
    open ? { limit: PAGE_LIMIT } : "skip",
  );
  const markRead = useMutation(api.notifications.mutations.markRead);
  const markAllRead = useMutation(api.notifications.mutations.markAllRead);
  const [markingAll, setMarkingAll] = useState(false);

  async function handleSelect(notification: {
    _id: Id<"notifications">;
    caseId?: Id<"cases">;
  }) {
    try {
      await markRead({ notificationId: notification._id });
    } catch (err) {
      toast.error(errorMessage(err));
      return;
    }
    if (notification.caseId !== undefined) {
      onOpenChange(false);
      navigate(`/cases?caseId=${notification.caseId}`);
    }
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      await markAllRead({});
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            Reminders and attention items for your workspace.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markingAll || list === undefined || list.length === 0}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {markingAll ? "Working…" : "Mark all as read"}
            </button>
          </div>
          {list === undefined ? (
            <LoadingSkeleton rows={3} />
          ) : list.length === 0 ? (
            <EmptyState title="You're caught up." />
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((row) => (
                <NotificationItem
                  key={row._id}
                  notification={row}
                  onSelect={() => void handleSelect(row)}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
