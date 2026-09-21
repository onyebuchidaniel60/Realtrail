import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/common/toast";
import { useSyncStatus } from "@/hooks/useSyncUser";
import { errorMessage, getAppError, inputClass } from "./dialogUtils";

export function AssignDialog({
  open,
  onClose,
  record,
}: {
  open: boolean;
  onClose: () => void;
  record: Doc<"cases">;
}) {
  const { userId } = useSyncStatus();
  const assign = useMutation(api.cases.mutations.assign);
  const [assignee, setAssignee] = useState<"unassigned" | "me">(
    !record.assigneeId ? "unassigned" : record.assigneeId === userId ? "me" : "unassigned",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ownedBySomeoneElse =
    record.assigneeId !== undefined &&
    record.assigneeId !== null &&
    record.assigneeId !== userId;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await assign({
        caseId: record._id,
        assigneeId:
          assignee === "me" && userId !== null
            ? (userId as Id<"users">)
            : null,
      });
      toast.success("Assignee updated");
      onClose();
    } catch (err) {
      const { code } = getAppError(err);
      if (code === "FORBIDDEN") {
        setFormError(
          "You are not permitted to change this assignment.",
        );
      } else {
        setFormError(errorMessage(err));
      }
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // TODO(member directory): full workspace member picker needs a
  // member-list query that does not exist yet.
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign case #{record.caseNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Assignee</span>
            <select
              value={assignee}
              onChange={(e) =>
                setAssignee(e.target.value as "unassigned" | "me")
              }
              className={inputClass}
              disabled={submitting}
            >
              <option value="unassigned">Unassigned</option>
              <option value="me">Assign to me</option>
            </select>
          </label>
          {ownedBySomeoneElse && (
            <p className="text-sm text-muted-foreground">
              This case is currently assigned to someone else. Staff members
              cannot reassign it — the server enforces this.
            </p>
          )}
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Save assignment
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
