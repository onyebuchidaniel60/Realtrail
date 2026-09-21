import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toast } from "@/components/common/toast";
import { errorMessage, getAppError, inputClass } from "./dialogUtils";

export type ClosureReason = "resolved" | "duplicate" | "invalid" | "cancelled";

const REASONS: Array<{ value: ClosureReason; label: string }> = [
  { value: "resolved", label: "Resolved" },
  { value: "duplicate", label: "Duplicate" },
  { value: "invalid", label: "Invalid" },
  { value: "cancelled", label: "Cancelled" },
];

export function CloseCaseDialog({
  open,
  onClose,
  record,
  allowed,
}: {
  open: boolean;
  onClose: () => void;
  record: Doc<"cases">;
  allowed: {
    resolved: boolean;
    duplicate: boolean;
    invalid: boolean;
    cancelled: boolean;
  };
}) {
  const closeCase = useMutation(api.cases.mutations.close);
  const [reason, setReason] = useState<ClosureReason | "">(
    allowed.resolved ? "resolved" : "",
  );
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const needsNote = reason !== "" && reason !== "resolved";

  async function handleContinue(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    if (reason === "") {
      setFormError("Choose a closure reason.");
      return;
    }
    if (needsNote && note.trim() === "") {
      setErrors({ note: "A note is required for this closure reason." });
      return;
    }
    setConfirming(true);
  }

  async function handleConfirm() {
    if (reason === "") {
      return;
    }
    setSubmitting(true);
    try {
      await closeCase({
        caseId: record._id,
        reason,
        note: note.trim() === "" ? undefined : note,
      });
      toast.success("Case closed");
      setConfirming(false);
      onClose();
    } catch (err) {
      const { code, field } = getAppError(err);
      if (code === "VALIDATION_ERROR" && field) {
        setErrors({ [field]: "This value was rejected. Check and retry." });
      } else {
        setFormError(errorMessage(err));
        toast.error(errorMessage(err));
      }
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog
        open={open && !confirming}
        onOpenChange={(v) => !v && onClose()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close case #{record.caseNumber}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleContinue} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Reason</legend>
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <input
                    type="radio"
                    name="close-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    disabled={!allowed[r.value]}
                  />
                  {r.label}
                  {!allowed[r.value] && (
                    <span className="text-xs text-muted-foreground">
                      (not available for this case)
                    </span>
                  )}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                Note{needsNote ? " (required)" : " (optional)"}
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className={inputClass}
              />
              {errors.note && (
                <span className="text-sm text-destructive">{errors.note}</span>
              )}
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
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground"
              >
                Continue
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={open && confirming}
        onOpenChange={(v) => !v && setConfirming(false)}
        title={`Close case #${record.caseNumber}?`}
        description="Closing ends active work on this case. Reopening is possible but creates a new operational cycle."
        confirmLabel="Close case"
        destructive
        confirming={submitting}
        onConfirm={handleConfirm}
      />
    </>
  );
}
