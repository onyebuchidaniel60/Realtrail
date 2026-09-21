import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { CaseStatus } from "../../../../convex/cases/stateMachine";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/common/toast";
import { errorMessage, inputClass } from "./dialogUtils";
import { formatStatus } from "../caseDisplay";

export function StatusChangeDialog({
  open,
  onClose,
  record,
  allowedTo,
}: {
  open: boolean;
  onClose: () => void;
  record: Doc<"cases">;
  allowedTo: CaseStatus[];
}) {
  const transition = useMutation(api.cases.mutations.transitionStatus);
  const [nextStatus, setNextStatus] = useState<CaseStatus | "">(
    allowedTo[0] ?? "",
  );
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (nextStatus === "") {
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await transition({
        caseId: record._id,
        nextStatus,
        note: note.trim() === "" ? undefined : note,
      });
      toast.success(`Case moved to ${formatStatus(nextStatus)}`);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change status</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Currently: {formatStatus(record.status)}
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">New status</span>
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as CaseStatus)}
              className={inputClass}
              disabled={submitting}
            >
              {allowedTo.map((s) => (
                <option key={s} value={s}>
                  {formatStatus(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={inputClass}
              disabled={submitting}
            />
          </label>
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
              disabled={submitting || nextStatus === ""}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Change status
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
